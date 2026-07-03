import { NextResponse } from "next/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"

export async function DELETE() {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const workspaceId = context.workspaceId

  const deleteSteps: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
    ["enrichment_runs", admin.from("enrichment_runs").delete().eq("workspace_id", workspaceId)],
    ["playbook_generation_runs", admin.from("playbook_generation_runs").delete().eq("workspace_id", workspaceId)],
    ["processing_jobs", admin.from("processing_jobs").delete().eq("workspace_id", workspaceId)],
    ["workspace_provider_settings", admin.from("workspace_provider_settings").delete().eq("workspace_id", workspaceId)],
    ["coaching_comments", admin.from("coaching_comments").delete().eq("workspace_id", workspaceId)],
    ["call_score_dimensions", admin.from("call_score_dimensions").delete().eq("workspace_id", workspaceId)],
    ["call_scores", admin.from("call_scores").delete().eq("workspace_id", workspaceId)],
    ["call_artifacts", admin.from("call_artifacts").delete().eq("workspace_id", workspaceId)],
    ["calls", admin.from("calls").delete().eq("workspace_id", workspaceId)],
    ["playbook_assignments", admin.from("playbook_assignments").delete().eq("workspace_id", workspaceId)],
    ["playbook_criteria", admin.from("playbook_criteria").delete().eq("workspace_id", workspaceId)],
    ["playbook_categories", admin.from("playbook_categories").delete().eq("workspace_id", workspaceId)],
    ["playbook_source_documents", admin.from("playbook_source_documents").delete().eq("workspace_id", workspaceId)],
    ["playbooks", admin.from("playbooks").delete().eq("workspace_id", workspaceId)],
    ["pending_invites", admin.from("pending_invites").delete().eq("workspace_id", workspaceId)],
    ["workspace_members", admin.from("workspace_members").delete().eq("workspace_id", workspaceId)],
    ["workspaces", admin.from("workspaces").delete().eq("id", workspaceId)],
  ]

  for (const [label, operation] of deleteSteps) {
    const { error } = await operation
    if (error) {
      return NextResponse.json({ error: `Unable to delete ${label}: ${error.message}` }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}
