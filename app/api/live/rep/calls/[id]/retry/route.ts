import { NextResponse, after } from "next/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"
import { prepareCallRetry } from "@/lib/jobs/processors"
import { dispatchProcessingJob } from "@/lib/jobs/dispatch"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getLiveViewerContext("rep")

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const admin = createAdminClient()
  const { data: call } = await admin
    .from("calls")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", viewer.workspaceId)
    .eq("rep_id", viewer.viewer.id)
    .maybeSingle()

  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 })
  }

  try {
    const { jobId } = await prepareCallRetry(id, viewer.workspaceId)
    // Deferred past the response so the client's immediate refetch sees
    // processing_status "processing" (set inside prepareCallRetry) instead of
    // racing the in-process job fallback to completion before ever observing it.
    after(async () => {
      await dispatchProcessingJob(jobId)
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retry call"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
