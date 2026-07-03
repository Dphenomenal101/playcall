import { createAdminClient } from "@/lib/supabase/admin"
import type { AppRole } from "@/lib/data/auth"

function getAppOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "")
}

export function createWorkspaceSignInLink(email: string, role: AppRole, isPendingInvite = false) {
  const next =
    role === "rep"
      ? isPendingInvite
        ? "/rep/onboarding"
        : "/rep"
      : "/manager"

  return `${getAppOrigin()}/auth?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`
}

interface InviteEmailContext {
  workspaceName: string
  inviterName: string | null
  inviterEmail: string | null
}

function toDisplayName(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }

  if (normalized.includes("@")) {
    const localPart = normalized.split("@")[0] ?? ""
    const words = localPart
      .split(/[._-]+/g)
      .map((part) => part.trim())
      .filter(Boolean)

    if (words.length > 0) {
      return words
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    }
  }

  return normalized
}

function normalizeWorkspaceName(workspaceName: string) {
  const trimmed = workspaceName.trim()
  return trimmed || "Playcall Workspace"
}

export async function sendWorkspaceInviteEmail(email: string, role: AppRole, context: InviteEmailContext) {
  const admin = createAdminClient()
  const next = role === "rep" ? "/rep/onboarding" : "/manager"
  const redirectTo = `${getAppOrigin()}/auth?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`
  const workspaceName = normalizeWorkspaceName(context.workspaceName)
  const inviterEmail = context.inviterEmail?.trim() || null
  const inviterName = toDisplayName(context.inviterName) ?? toDisplayName(inviterEmail) ?? "Your manager"
  const roleLabel = role === "manager" ? "manager" : "rep"

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      workspace_name: workspaceName,
      workspace: workspaceName,
      inviter_name: inviterName,
      inviter: inviterName,
      inviter_email: inviterEmail,
      invited_role: roleLabel,
      role: roleLabel,
    },
  })

  if (error) {
    throw error
  }
}
