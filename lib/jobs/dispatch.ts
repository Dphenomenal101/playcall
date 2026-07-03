import { createAdminClient } from "../supabase/admin"
import { syncCallProcessingStatus, syncPlaybookProcessingStatus } from "../data/processing-status"
import { updateProcessingJobStatus } from "./service"

async function markDispatchFailure(jobId: string, lastError: string) {
  const admin = createAdminClient()
  const { data: job } = await admin
    .from("processing_jobs")
    .select("entity_type, entity_id")
    .eq("id", jobId)
    .maybeSingle()

  await updateProcessingJobStatus(admin as any, jobId, "failed", {
    lastError,
  }).catch(() => null)

  if (!job) {
    return
  }

  if (job.entity_type === "playbook_source_document") {
    const { data: sourceDocument } = await admin
      .from("playbook_source_documents")
      .update({
        processing_status: "failed",
        processing_error: lastError,
      })
      .eq("id", job.entity_id)
      .select("playbook_id")
      .maybeSingle()

    if (sourceDocument?.playbook_id) {
      await syncPlaybookProcessingStatus(sourceDocument.playbook_id).catch(() => null)
    }

    return
  }

  if (job.entity_type === "call_artifact") {
    const { data: artifact } = await admin
      .from("call_artifacts")
      .update({
        processing_status: "failed",
        processing_error: lastError,
      })
      .eq("id", job.entity_id)
      .select("call_id")
      .maybeSingle()

    if (artifact?.call_id) {
      await syncCallProcessingStatus(artifact.call_id).catch(() => null)
    }

    return
  }

  if (job.entity_type === "playbook") {
    await admin.from("playbooks").update({ processing_status: "failed" }).eq("id", job.entity_id)
    return
  }

  if (job.entity_type === "call") {
    await admin.from("calls").update({ processing_status: "failed" }).eq("id", job.entity_id)
  }
}

export async function dispatchProcessingJob(jobId: string) {
  const admin = createAdminClient()

  // Look up job type once — used to decide Edge Function vs local and for
  // chaining downstream jobs after buyer_enrichment completes.
  const { data: jobMeta } = await admin
    .from("processing_jobs")
    .select("job_type, entity_id, entity_type")
    .eq("id", jobId)
    .maybeSingle()

  const jobType = jobMeta?.job_type ?? ""

  // call_scoring takes 60-150+ seconds which regularly exceeds the Edge Function
  // 150 s wall-clock limit. Always run it locally so it can finish without a cap.
  if (jobType === "call_scoring") {
    try {
      const { processJobById } = await import("./processors")
      await processJobById(jobId)
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "Call scoring failed"
      await markDispatchFailure(jobId, lastError)
    }
    return
  }

  let edgeFunctionSucceeded = false

  try {
    const { error } = await admin.functions.invoke("process-job", {
      body: { jobId },
    })

    if (!error) {
      edgeFunctionSucceeded = true
    } else {

      // The Edge Function ran and returned a non-2xx response. Check job state
      // to decide whether falling back locally is safe.
      const { data: jobRow } = await admin
        .from("processing_jobs")
        .select("status, started_at")
        .eq("id", jobId)
        .maybeSingle()

      if (jobRow?.status === "completed") {
        // Job finished successfully despite the error response — nothing to do.
        console.warn("[jobs] edge function error but job completed — not retrying locally", { jobId, error })
        edgeFunctionSucceeded = true
      } else if (jobRow?.status === "processing") {
        // Edge Function claimed the job but may have timed out (Supabase hard-limits
        // Edge Functions to 150 s). If started_at is older than 145 s, the function
        // definitely crashed without finishing — force-reset so local fallback can run.
        const startedAt = jobRow.started_at ? new Date(jobRow.started_at as string) : null
        const runningMs = startedAt ? Date.now() - startedAt.getTime() : 0

        if (runningMs < 145_000) {
          // Well within the Edge Function window — probably still running, skip fallback.
          console.warn("[jobs] edge function error but job still in progress — not retrying locally", { jobId, runningMs, error })
          return
        }

        // At or past the Edge Function timeout (150 s) — it crashed. Reset so local fallback can claim it.
        console.warn("[jobs] edge function timed out — resetting stale processing job for local fallback", { jobId, runningMs })
        const { error: resetErr } = await admin
          .from("processing_jobs")
          .update({ status: "failed", last_error: "Edge Function timed out" })
          .eq("id", jobId)
          .eq("status", "processing")
        if (resetErr) {
          console.error("[jobs] failed to reset timed-out job", { jobId, resetErr })
          return
        }

        console.warn("[jobs] edge function returned error, falling back to local processing", { jobId, error })
      } else {
        console.warn("[jobs] edge function returned error, falling back to local processing", { jobId, error })
      }
    }
  } catch (invokeError) {
    // Transport/network failure — function likely never ran, safe to fall back
    console.warn("[jobs] process-job invoke failed (transport), falling back to local processing", {
      jobId,
      error: invokeError instanceof Error ? invokeError.message : "unknown error",
    })
  }

  if (!edgeFunctionSucceeded) {
    // The Edge Function may have marked the job (and its parent call) as
    // "failed" before returning 4xx. Reset the call to "processing" now so
    // the UI doesn't flash a false failure state during the local retry.
    if (jobMeta?.entity_type === "call") {
      const { data: jobRow } = await admin
        .from("processing_jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle()
      if (jobRow?.status === "failed") {
        await admin
          .from("calls")
          .update({ processing_status: "processing" })
          .eq("id", jobMeta.entity_id)
      }
    }

    try {
      const { processJobById } = await import("./processors")
      await processJobById(jobId)
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "Unable to dispatch processing job"
      await markDispatchFailure(jobId, lastError)
      return
    }
  }

  // After call_transcription completes in the Edge Function, the vendor processor
  // deliberately skips dispatching buyer_enrichment (nested Edge Function calls
  // return 403). Pick it up here from Next.js context instead. Idempotent: if
  // call_transcription ran locally (fallback), processCallTranscriptionJob already
  // called maybeQueueNextCallJobs and this will be a no-op.
  if (jobType === "call_transcription" && jobMeta?.entity_type === "call") {
    const { maybeQueueNextCallJobs } = await import("./processors")
    await maybeQueueNextCallJobs(jobMeta.entity_id).catch((err) => {
      console.error("[jobs] failed to queue next jobs after call_transcription", { jobId, error: err instanceof Error ? err.message : err })
    })
  }

  // After buyer_enrichment completes (via Edge Function or local), dispatch any
  // queued call_scoring job for the same call locally. This keeps call_scoring
  // out of the Edge Function where it would hit the 150 s wall-clock limit.
  if (jobType === "buyer_enrichment" && jobMeta?.entity_type === "call") {
    const { data: scoringJob } = await admin
      .from("processing_jobs")
      .select("id")
      .eq("entity_type", "call")
      .eq("entity_id", jobMeta.entity_id)
      .eq("job_type", "call_scoring")
      .eq("status", "queued")
      .limit(1)
      .maybeSingle()

    if (scoringJob) {
      console.log("[jobs] buyer_enrichment done — dispatching call_scoring locally", { callId: jobMeta.entity_id, scoringJobId: scoringJob.id })
      await dispatchProcessingJob(scoringJob.id)
    }
  }
}
