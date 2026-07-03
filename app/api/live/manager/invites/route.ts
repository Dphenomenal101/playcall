import { NextResponse, after } from "next/server"
import { revalidateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendWorkspaceInviteEmail } from "@/lib/auth/invite"
import type { AppRole } from "@/lib/data/auth"

type PendingInviteInsert = {
  workspace_id: string
  email: string
  role: AppRole
  playbook_ids: string[]
  invited_by: string
  status: "pending"
}

export async function POST(request: Request) {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await request.json()
  const emails = Array.isArray(body.emails) ? body.emails.filter((value: unknown): value is string => typeof value === "string") : []
  const role: AppRole = body.role === "Manager" ? "manager" : "rep"
  const rawPlaybookIds = Array.isArray(body.playbookIds)
    ? body.playbookIds.filter((value: unknown): value is string => typeof value === "string")
    : []

  // Without this a manager could store foreign-workspace playbook IDs that become
  // real assignments when the invite is accepted.
  let playbookIds: string[] = []
  if (rawPlaybookIds.length > 0) {
    const admin = createAdminClient()
    const { data: ownedPlaybooks } = await admin
      .from("playbooks")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .in("id", rawPlaybookIds)
    playbookIds = (ownedPlaybooks ?? []).map((p) => p.id)
  }

  const normalizedEmails = Array.from(
    new Set<string>(emails.map((email: string) => email.trim().toLowerCase()).filter(Boolean))
  )
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", context.workspaceId)
    .maybeSingle()

  if (workspaceError) {
    return NextResponse.json({ error: workspaceError.message }, { status: 400 })
  }

  const records: PendingInviteInsert[] = normalizedEmails.map((email) => ({
      workspace_id: context.workspaceId,
      email,
      role,
      playbook_ids: playbookIds,
      invited_by: context.viewer.id,
      status: "pending",
    }))

  if (records.length === 0) {
    return NextResponse.json({ error: "No invite emails provided" }, { status: 400 })
  }

  const [{ data: existingInvites, error: existingInvitesError }, { data: existingMembers, error: existingMembersError }] =
    await Promise.all([
      supabase
        .from("pending_invites")
        .select("email")
        .eq("workspace_id", context.workspaceId)
        .eq("status", "pending")
        .in("email", normalizedEmails),
      supabase
        .from("workspace_members")
        .select("user_id, profiles!inner(email)")
        .eq("workspace_id", context.workspaceId)
        .eq("status", "active"),
    ])

  if (existingInvitesError) {
    return NextResponse.json({ error: existingInvitesError.message }, { status: 400 })
  }

  if (existingMembersError) {
    return NextResponse.json({ error: existingMembersError.message }, { status: 400 })
  }

  const pendingEmailSet = new Set<string>((existingInvites ?? []).map((invite) => invite.email))
  const memberEmailSet = new Set<string>(
    (existingMembers ?? [])
      .map((member: any) => member.profiles?.email)
      .filter((email: string | null | undefined): email is string => Boolean(email))
      .map((email: string) => email.toLowerCase())
  )

  const recordsToInsert = records.filter((record) => !pendingEmailSet.has(record.email) && !memberEmailSet.has(record.email))

  let inserted: Array<{ id: string; email: string; role: AppRole; playbook_ids: string[]; sent_at: string; status: string }> = []
  if (recordsToInsert.length > 0) {
    const { data, error } = await supabase
      .from("pending_invites")
      .insert(recordsToInsert)
      .select("id, email, role, playbook_ids, sent_at, status")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    inserted = (data ?? []) as typeof inserted
  }

  // Email delivery is 1-3s+; send after the response so the manager isn't blocked.
  after(async () => {
    await Promise.all(
      recordsToInsert.map((record) =>
        sendWorkspaceInviteEmail(record.email, record.role, {
          workspaceName: workspace?.name ?? "Playcall Workspace",
          inviterName: context.viewer.name,
          inviterEmail: context.viewer.email,
        }).catch((inviteError) => {
          console.error(`[invites] failed to send invite email to ${record.email}`, inviteError)
        })
      )
    )
  })

  revalidateTag(`workspace-${context.workspaceId}`, "max")
  return NextResponse.json({
    invites: inserted,
    skipped: {
      alreadyPending: records.filter((record) => pendingEmailSet.has(record.email)).map((record) => record.email),
      alreadyMembers: records.filter((record) => memberEmailSet.has(record.email)).map((record) => record.email),
    },
  })
}

export async function DELETE(request: Request) {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await request.json().catch(() => null)
  const inviteId = typeof body?.inviteId === "string" ? body.inviteId : ""

  if (!inviteId) {
    return NextResponse.json({ error: "Missing invite id" }, { status: 400 })
  }

  const { error } = await supabase
    .from("pending_invites")
    .delete()
    .eq("id", inviteId)
    .eq("workspace_id", context.workspaceId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  revalidateTag(`workspace-${context.workspaceId}`, "max")
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await request.json().catch(() => null)
  const inviteId = typeof body?.inviteId === "string" ? body.inviteId : ""

  if (!inviteId) {
    return NextResponse.json({ error: "Missing invite id" }, { status: 400 })
  }

  const { data: invite, error: inviteError } = await supabase
    .from("pending_invites")
    .select("id, email, role")
    .eq("id", inviteId)
    .eq("workspace_id", context.workspaceId)
    .eq("status", "pending")
    .maybeSingle()

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  if (!invite) {
    return NextResponse.json({ error: "Pending invite not found" }, { status: 404 })
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", context.workspaceId)
    .maybeSingle()

  if (workspaceError) {
    return NextResponse.json({ error: workspaceError.message }, { status: 400 })
  }

  after(async () => {
    try {
      await sendWorkspaceInviteEmail(invite.email, invite.role as AppRole, {
        workspaceName: workspace?.name ?? "Playcall Workspace",
        inviterName: context.viewer.name,
        inviterEmail: context.viewer.email,
      })
    } catch (error) {
      console.error(`[invites] failed to resend invite email to ${invite.email}`, error)
    }
  })

  revalidateTag(`workspace-${context.workspaceId}`, "max")
  return NextResponse.json({ ok: true })
}
