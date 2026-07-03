import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentMembership, getProfile } from "@/lib/data/auth"
import { createAdminClient } from "@/lib/supabase/admin"

function formatWorkspaceNameFromEmail(email: string | null) {
  if (!email || !email.includes("@")) {
    return "My Revenue Team"
  }

  const company = email.split("@")[1]?.split(".")[0] ?? "my"
  const label = company
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

  return `${label || "My"} Revenue Team`
}

export async function GET() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [profile, membership] = await Promise.all([
    getProfile(supabase as any, user.id),
    getCurrentMembership(supabase as any, user.id),
  ])
  const email = profile?.email ?? user.email ?? null
  const fullName =
    profile?.full_name ??
    (typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : null)

  const domain = email?.split("@")[1] ?? ""
  const suggestedWorkspaceName = formatWorkspaceNameFromEmail(email)

  let workspaceName: string | null = null
  if (membership?.workspaceId) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspaceId)
      .maybeSingle()

    workspaceName = workspace?.name ?? null
  }

  let invite = null as
    | {
        workspaceName: string | null
        inviterName: string | null
        inviterEmail: string | null
        playbookNames: string[]
        playbookCount: number
        status: string
      }
    | null

  if (email) {
    let inviteQuery = admin
      .from("pending_invites")
      .select("workspace_id, invited_by, playbook_ids, status, sent_at")
      .eq("email", email.toLowerCase())
      .order("sent_at", { ascending: false })
      .limit(1)

    if (membership?.workspaceId) {
      inviteQuery = inviteQuery.eq("workspace_id", membership.workspaceId)
    }

    const { data: inviteRow } = await inviteQuery.maybeSingle()

    if (inviteRow) {
      const [{ data: inviter }, { data: inviteWorkspace }, { data: playbooks }] = await Promise.all([
        inviteRow.invited_by
          ? admin.from("profiles").select("full_name, email").eq("id", inviteRow.invited_by).maybeSingle()
          : Promise.resolve({ data: null }),
        admin.from("workspaces").select("name").eq("id", inviteRow.workspace_id).maybeSingle(),
        Array.isArray(inviteRow.playbook_ids) && inviteRow.playbook_ids.length > 0
          ? admin.from("playbooks").select("name").in("id", inviteRow.playbook_ids)
          : Promise.resolve({ data: [] as Array<{ name: string }> }),
      ])

      invite = {
        workspaceName: inviteWorkspace?.name ?? workspaceName,
        inviterName: inviter?.full_name ?? null,
        inviterEmail: inviter?.email ?? null,
        playbookNames: (playbooks ?? []).map((playbook) => playbook.name),
        playbookCount: Array.isArray(inviteRow.playbook_ids) ? inviteRow.playbook_ids.length : 0,
        status: inviteRow.status,
      }
    }
  }

  return NextResponse.json({
    email,
    fullName,
    domain,
    workspaceId: membership?.workspaceId ?? null,
    workspaceName: workspaceName ?? suggestedWorkspaceName,
    suggestedWorkspaceName,
    invite,
  })
}
