import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  verifyLlamaParseWebhookSignature,
  fetchLlamaParseJobResult,
  getLlamaParseApiKey,
  getLlamaParseWebhookSecret,
} from "@/lib/integrations/llamaparse"
import { maybeScheduleRubricIfAllSourcesReady } from "@/lib/data/live-write"
import { syncPlaybookProcessingStatus, syncCallProcessingStatus } from "@/lib/data/processing-status"
import { maybeQueueNextCallJobs } from "@/lib/jobs/processors"

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get("lc-signature") ?? request.headers.get("LC-Signature")
  const secret = getLlamaParseWebhookSecret()

  if (!verifyLlamaParseWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: { event_type?: string; data?: { id?: string; job_id?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.error("[llamaparse-webhook] invalid JSON, raw body:", rawBody.slice(0, 500))
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Normalise event type — LlamaParse may send "parse.success", "PARSE_SUCCESS", etc.
  const eventType = (payload?.event_type ?? "").toLowerCase().replace(/_/g, ".")

  // LlamaParse sends the job ID as data.id (not data.job_id as docs suggest)
  const jobId = payload?.data?.id ?? payload?.data?.job_id ?? ""

  console.log("[llamaparse-webhook]", { eventType, jobId })

  if (!jobId) {
    return NextResponse.json({ error: "Missing job_id" }, { status: 400 })
  }

  const admin = createAdminClient()

  // parse.error — mark the source doc failed and propagate to the playbook
  if (eventType === "parse.error") {
    const { data: failedDoc } = await admin
      .from("playbook_source_documents")
      .update({ processing_status: "failed", processing_error: "LlamaParse document parsing failed." })
      .eq("llama_job_id", jobId)
      .select("playbook_id")
      .maybeSingle()

    if (failedDoc?.playbook_id) {
      await syncPlaybookProcessingStatus(failedDoc.playbook_id).catch(() => null)
    }

    return NextResponse.json({ ok: true })
  }

  // Only proceed on success or partial_success — ignore pending/cancelled/running
  if (eventType !== "parse.success" && eventType !== "parse.partial_success") {
    return NextResponse.json({ ok: true })
  }

  // Check if this is a call transcript artifact (job ID stored in metadata)
  const { data: callArtifact } = await admin
    .from("call_artifacts")
    .select("id, call_id, workspace_id, metadata")
    .eq("metadata->>llamaJobId", jobId)
    .maybeSingle()

  if (callArtifact) {
    const apiKey = await getLlamaParseApiKey(callArtifact.workspace_id)
    if (!apiKey) {
      await admin.from("call_artifacts").update({ processing_status: "failed", processing_error: "LlamaParse API key not configured." }).eq("id", callArtifact.id)
      await syncCallProcessingStatus(callArtifact.call_id).catch(() => null)
      return NextResponse.json({ ok: true })
    }

    let result: Awaited<ReturnType<typeof fetchLlamaParseJobResult>>
    let attempt = 0
    do {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000))
      result = await fetchLlamaParseJobResult(jobId, apiKey)
      attempt++
    } while ("pending" in result && attempt < 5)

    if ("markdown" in result) {
      await admin.from("call_artifacts").update({
        transcript_text: result.markdown,
        processing_status: "ready",
        processing_error: null,
      }).eq("id", callArtifact.id)
      const status = await syncCallProcessingStatus(callArtifact.call_id)
      if (status === "ready") {
        await maybeQueueNextCallJobs(callArtifact.call_id).catch(() => null)
      }
    } else if ("error" in result) {
      await admin.from("call_artifacts").update({ processing_status: "failed", processing_error: result.error }).eq("id", callArtifact.id)
      await syncCallProcessingStatus(callArtifact.call_id).catch(() => null)
    } else {
      await admin.from("call_artifacts").update({ processing_status: "failed", processing_error: "LlamaParse result not ready after retries." }).eq("id", callArtifact.id)
      await syncCallProcessingStatus(callArtifact.call_id).catch(() => null)
    }

    return NextResponse.json({ ok: true })
  }

  // Look up the source doc by the LlamaParse job ID we stored at submission time
  const { data: sourceDoc } = await admin
    .from("playbook_source_documents")
    .select("id, playbook_id, workspace_id, llama_job_id")
    .eq("llama_job_id", jobId)
    .maybeSingle()

  if (!sourceDoc) {
    // Job not ours (e.g. from a different project sharing the same API key) — ignore
    return NextResponse.json({ ok: true })
  }

  const sourceDocumentId = sourceDoc.id

  const apiKey = await getLlamaParseApiKey(sourceDoc.workspace_id)
  if (!apiKey) {
    await admin
      .from("playbook_source_documents")
      .update({ processing_status: "failed", processing_error: "LlamaParse API key not configured." })
      .eq("id", sourceDocumentId)
    await syncPlaybookProcessingStatus(sourceDoc.playbook_id).catch(() => null)
    return NextResponse.json({ ok: true })
  }

  // Retry up to 5x with 2s delay — LlamaParse can fire the webhook slightly
  // before the result is readable on the GET endpoint.
  let result: Awaited<ReturnType<typeof fetchLlamaParseJobResult>>
  let attempt = 0
  do {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000))
    result = await fetchLlamaParseJobResult(jobId, apiKey)
    attempt++
    console.log("[llamaparse-webhook] fetch attempt", attempt, "→", "pending" in result ? "pending" : "error" in result ? `error: ${result.error}` : `markdown (${result.markdown.length} chars)`)
  } while ("pending" in result && attempt < 5)

  if ("markdown" in result) {
    const { error: updateErr } = await admin
      .from("playbook_source_documents")
      .update({ pasted_content: result.markdown, processing_status: "ready", processing_error: null })
      .eq("id", sourceDocumentId)
    console.log("[llamaparse-webhook] source doc updated to ready", { sourceDocumentId, updateErr })

    try {
      await maybeScheduleRubricIfAllSourcesReady(sourceDoc.workspace_id, sourceDoc.playbook_id)
      console.log("[llamaparse-webhook] rubric scheduled for playbook", sourceDoc.playbook_id)
    } catch (err) {
      console.error("[llamaparse-webhook] failed to schedule rubric", err)
    }
  } else if ("error" in result) {
    console.error("[llamaparse-webhook] job result error", result.error)
    await admin
      .from("playbook_source_documents")
      .update({ processing_status: "failed", processing_error: result.error })
      .eq("id", sourceDocumentId)
    await syncPlaybookProcessingStatus(sourceDoc.playbook_id).catch(() => null)
  } else {
    // Still pending after all retries — mark failed so user isn't stuck forever
    console.error("[llamaparse-webhook] job still pending after retries, marking failed", { jobId })
    await admin
      .from("playbook_source_documents")
      .update({ processing_status: "failed", processing_error: "LlamaParse result not ready after retries. Please re-upload." })
      .eq("id", sourceDocumentId)
    await syncPlaybookProcessingStatus(sourceDoc.playbook_id).catch(() => null)
  }

  return NextResponse.json({ ok: true })
}
