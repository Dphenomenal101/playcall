import type { User } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"

type MinimalSupabaseClient = {
  from: (table: string) => any
}

export type AppRole = "manager" | "rep"

export interface WorkspaceMembership {
  workspaceId: string
  role: AppRole
}

export interface PendingInviteAccess {
  workspaceId: string
  role: AppRole
}

export async function upsertProfileFromAuthUser(client: MinimalSupabaseClient, user: User) {
  const authFullName =
    (typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name) ||
    (typeof user.user_metadata.name === "string" && user.user_metadata.name) ||
    null

  const { data: existingProfile, error: existingProfileError } = await client
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle()

  if (existingProfileError) {
    throw existingProfileError
  }

  const fullName = authFullName ?? existingProfile?.full_name ?? null

  const { error } = await client.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: fullName,
      last_sign_in_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  )

  if (error) {
    throw error
  }
}

export async function acceptPendingInvites(client: MinimalSupabaseClient, user: User) {
  if (!user.email) {
    return
  }

  const admin = createAdminClient()
  const normalizedEmail = user.email.toLowerCase()
  const { data: invites, error } = await admin
    .from("pending_invites")
    .select("id, workspace_id, role, playbook_ids")
    .eq("email", normalizedEmail)
    .eq("status", "pending")

  if (error) {
    throw error
  }

  if (!invites || invites.length === 0) {
    return
  }

  for (const invite of invites) {
    const { error: membershipError } = await admin.from("workspace_members").upsert(
      {
        workspace_id: invite.workspace_id,
        user_id: user.id,
        role: invite.role,
        status: "active",
      },
      { onConflict: "workspace_id,user_id" }
    )

    if (membershipError) {
      throw membershipError
    }

    const rawPlaybookIds = Array.isArray(invite.playbook_ids) ? invite.playbook_ids : []

    if (invite.role === "rep" && rawPlaybookIds.length > 0) {
      // Defence-in-depth: the invite route validates on write, but stored invites
      // could pre-date that fix or arrive via other paths.
      const { data: ownedPlaybooks } = await admin
        .from("playbooks")
        .select("id")
        .eq("workspace_id", invite.workspace_id)
        .in("id", rawPlaybookIds)

      const playbookIds = (ownedPlaybooks ?? []).map((p: { id: string }) => p.id)

      if (playbookIds.length > 0) {
        const assignments = playbookIds.map((playbookId: string) => ({
          workspace_id: invite.workspace_id,
          playbook_id: playbookId,
          user_id: user.id,
        }))

        const { error: assignmentError } = await admin.from("playbook_assignments").upsert(assignments, {
          onConflict: "playbook_id,user_id",
        })

        if (assignmentError) {
          throw assignmentError
        }
      }
    }

    const { error: inviteUpdateError } = await admin
      .from("pending_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id)

    if (inviteUpdateError) {
      throw inviteUpdateError
    }
  }
}

export async function finalizeUserAccess(client: MinimalSupabaseClient, user: User) {
  await upsertProfileFromAuthUser(client, user)
  await acceptPendingInvites(client, user)
}

export async function getCurrentMembership(client: MinimalSupabaseClient, userId: string): Promise<WorkspaceMembership | null> {
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    workspaceId: data.workspace_id,
    role: data.role,
  }
}

export async function getPendingInviteAccess(
  _client: MinimalSupabaseClient,
  email: string | null | undefined
): Promise<PendingInviteAccess | null> {
  const normalizedEmail = email?.trim().toLowerCase()

  if (!normalizedEmail) {
    return null
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("pending_invites")
    .select("workspace_id, role")
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    workspaceId: data.workspace_id,
    role: data.role,
  }
}

export async function getPostAuthRedirectPath(
  client: MinimalSupabaseClient,
  userId: string,
  userEmail?: string | null
) {
  const membership = await getCurrentMembership(client, userId)

  if (!membership) {
    const pendingInvite = await getPendingInviteAccess(client, userEmail)

    if (pendingInvite?.role === "rep") {
      return "/rep/onboarding"
    }

    return "/manager/onboarding"
  }

  return membership.role === "manager" ? "/manager" : "/rep"
}

export async function getProfile(client: MinimalSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}
