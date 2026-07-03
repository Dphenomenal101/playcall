import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getLiveViewerContext("manager")

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  if (id === viewer.viewer.id) {
    return NextResponse.json({ error: "You cannot remove yourself from the workspace" }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: assignmentsError } = await admin
    .from("playbook_assignments")
    .delete()
    .eq("workspace_id", viewer.workspaceId)
    .eq("user_id", id)

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 400 })
  }

  const { error: memberError } = await admin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", viewer.workspaceId)
    .eq("user_id", id)

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 })
  }

  revalidateTag(`workspace-${viewer.workspaceId}`, "max")
  return NextResponse.json({ ok: true })
}
