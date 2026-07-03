import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { acceptPendingInvites } from "@/lib/data/auth"
import { createWorkspaceForManager, createPlaybookForWorkspace } from "@/lib/data/live-write"
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const action = body.action === "bootstrap" ? "bootstrap" : "finalize"
  const workspace = body.workspace ?? {}
  const requestedWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
  const playbook = body.playbook ?? null
  const invites = Array.isArray(body.invites) ? body.invites.filter((value: unknown): value is string => typeof value === "string") : []
  const workspaceName = typeof workspace.name === "string" ? workspace.name.trim() : ""
  const companyDomain = typeof workspace.domain === "string" ? workspace.domain.trim().toLowerCase() : ""
  const companyLogoUrl = typeof workspace.logoUrl === "string" ? workspace.logoUrl.trim() : ""
  const submittedManagerName = typeof body.managerName === "string" ? body.managerName.trim() : ""
  const inviterName =
    submittedManagerName ||
    (typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata.name === "string" && user.user_metadata.name.trim()) ||
    (user.email?.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) ?? null)

  if (!workspaceName) {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 })
  }

  if (!companyDomain) {
    return NextResponse.json({ error: "Company domain is required" }, { status: 400 })
  }

  if (action === "bootstrap" && !submittedManagerName) {
    return NextResponse.json({ error: "Your name is required" }, { status: 400 })
  }

  await acceptPendingInvites(supabase as any, user)

  const admin = createAdminClient()

  if (submittedManagerName) {
    // Passwordless email-OTP auth never collects a name - without this,
    // profiles.full_name stays null forever and every dashboard surface
    // that displays "name" silently falls back to showing the raw email.
    await admin.from("profiles").update({ full_name: submittedManagerName }).eq("id", user.id)
  }

  let workspaceId = requestedWorkspaceId

  if (workspaceId) {
    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("role", "manager")
      .eq("status", "active")
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }

    if (!membership?.workspace_id) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }
  } else {
    const createdWorkspace = await createWorkspaceForManager({
      user,
      workspaceName,
      companyDomain,
      companyLogoUrl,
    })
    workspaceId = createdWorkspace.workspaceId
  }

  if (action === "bootstrap") {
    return NextResponse.json({ workspaceId })
  }

  if (playbook) {
    await createPlaybookForWorkspace({
      workspaceId,
      userId: user.id,
      payload: {
        ...playbook,
        uploadedFiles: [],
      },
    })
  }

  if (invites.length > 0) {
    const normalizedEmails = Array.from(
      new Set<string>(invites.map((email: string) => email.trim().toLowerCase()).filter(Boolean))
    )
    const normalizedInvites: PendingInviteInsert[] = normalizedEmails.map((email) => ({
        workspace_id: workspaceId,
        email,
        role: "rep" as AppRole,
        playbook_ids: [],
        invited_by: user.id,
        status: "pending",
      }))

    if (normalizedInvites.length > 0) {
      const { data: existingInvites, error: existingInvitesError } = await supabase
        .from("pending_invites")
        .select("email")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .in("email", normalizedEmails)

      if (existingInvitesError) {
        return NextResponse.json({ error: existingInvitesError.message }, { status: 400 })
      }

      const pendingEmailSet = new Set<string>((existingInvites ?? []).map((invite) => invite.email))
      const invitesToInsert = normalizedInvites.filter((invite) => !pendingEmailSet.has(invite.email))

      const { error } = invitesToInsert.length > 0 ? await supabase.from("pending_invites").insert(invitesToInsert) : { error: null }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const invite of invitesToInsert) {
        try {
          await sendWorkspaceInviteEmail(invite.email, invite.role, {
            workspaceName,
            inviterName,
            inviterEmail: user.email ?? null,
          })
        } catch (inviteError) {
          return NextResponse.json(
            {
              error: inviteError instanceof Error ? inviteError.message : "Unable to send invite email",
            },
            { status: 400 }
          )
        }
      }
    }
  }

  return NextResponse.json({ workspaceId })
}
