import { NextResponse } from "next/server"
import { basename } from "node:path"
import { put } from "@vercel/blob"
import { revalidateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"
import { maybeQueueNextCallJobs } from "@/lib/jobs/processors"
import { syncCallProcessingStatus } from "@/lib/data/processing-status"
import { isPlainTextFile } from "@/lib/extraction/document"
import { validateUploadedFile } from "@/lib/validation/file-upload"
import { submitLlamaParseJob } from "@/lib/integrations/llamaparse"

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "aac", "flac", "webm", "mpeg", "mpga"])

function isAudioFile(fileName: string): boolean {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}

function parseAmount(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  const cleaned = Number(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(cleaned) ? cleaned : null
}

// outcome_status enum uses spaces ("next step booked") not kebab-case; "no-show" is the exception.
const OUTCOME_STATUS_BY_KEBAB: Record<string, string> = {
  "no-show": "no-show",
  "next-step-booked": "next step booked",
  "moved-stage": "moved stage",
  "no-advancement": "no advancement",
  "closed-won": "closed won",
  "closed-lost": "closed lost",
}

function normalizeOutcomeStatus(value: string) {
  return OUTCOME_STATUS_BY_KEBAB[value] ?? null
}

export async function POST(request: Request) {
  const context = await getLiveViewerContext("rep")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const formData = await request.formData()
  const uploadedFile = formData.get("file")
  const audioBlobUrl = formData.get("audioBlobUrl")
  const transcriptSource = String(formData.get("transcriptSource") ?? "file")
  const linkedinUrl = String(formData.get("linkedinUrl") ?? "").trim()
  const contactEmail = String(formData.get("contactEmail") ?? "").trim()
  const transcriptText = String(formData.get("transcript") ?? "").trim()
  const companyName = String(formData.get("company") ?? "").trim()
  const contactName = String(formData.get("contactName") ?? "").trim()

  if (!companyName || !contactName) {
    return NextResponse.json(
      { error: "Company and contact name are required - both are used directly in scoring and enrichment." },
      { status: 400 }
    )
  }

  if (!linkedinUrl && !contactEmail) {
    return NextResponse.json(
      { error: "A LinkedIn URL or contact email is required for live buyer-aware scoring." },
      { status: 400 }
    )
  }

  const hasFile = uploadedFile instanceof File && uploadedFile.size > 0
  const hasAudioBlob = typeof audioBlobUrl === "string" && audioBlobUrl.trim().length > 0

  if (hasAudioBlob) {
    const url = (audioBlobUrl as string).trim()
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
        return NextResponse.json({ error: "Invalid audio URL." }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: "Invalid audio URL." }, { status: 400 })
    }
  }

  if (!hasFile && !hasAudioBlob && !transcriptText) {
    return NextResponse.json({ error: "Upload a transcript/audio file or provide transcript text." }, { status: 400 })
  }

  if (hasFile) {
    const validation = validateUploadedFile(uploadedFile)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
  }

  const playbookId = String(formData.get("playbookId") ?? "")

  if (!playbookId) {
    return NextResponse.json({ error: "A playbook is required." }, { status: 400 })
  }

  // UI filters to assigned playbooks only, but RLS doesn't — enforce server-side.
  const { data: assignment } = await admin
    .from("playbook_assignments")
    .select("playbook_id")
    .eq("workspace_id", context.workspaceId)
    .eq("playbook_id", playbookId)
    .eq("user_id", context.viewer.id)
    .maybeSingle()

  if (!assignment) {
    return NextResponse.json({ error: "You are not assigned to this playbook." }, { status: 403 })
  }

  const callPayload = {
    workspace_id: context.workspaceId,
    rep_id: context.viewer.id,
    playbook_id: playbookId,
    company_name: companyName,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_linkedin_url: linkedinUrl || null,
    contact_role: String(formData.get("contactRole") ?? ""),
    call_type: String(formData.get("callType") ?? ""),
    deal_stage_before: String(formData.get("dealStageBefore") ?? ""),
    deal_stage_after: String(formData.get("dealStageAfter") ?? ""),
    outcome: normalizeOutcomeStatus(String(formData.get("outcome") ?? "")),
    pipeline_amount: parseAmount(formData.get("pipelineValue")),
    rep_notes: String(formData.get("notes") ?? ""),
    processing_status: "queued",
    buyer_context: {
      company: {
        name: companyName,
        domain: String(formData.get("companyDomain") ?? ""),
      },
      contact: {
        name: contactName,
        email: contactEmail,
        linkedinUrl,
        title: String(formData.get("contactRole") ?? ""),
      },
      confidence: { company: 0, contact: 0, stage: 0, salesMotion: 0 },
      sources: { company: [], contact: [], retrievedAt: new Date().toISOString() },
    },
  }

  const { data: call, error: callError } = await supabase.from("calls").insert(callPayload).select("id").single()

  if (callError || !call) {
    return NextResponse.json({ error: callError?.message ?? "Unable to create call" }, { status: 400 })
  }

  if (hasAudioBlob) {
    const rawFileName = String(formData.get("audioFileName") ?? "recording.mp3")
    const fileName = basename(rawFileName).replace(/[^a-zA-Z0-9._-]/g, "_") || "recording.mp3"
    const { data: artifact, error: artifactError } = await supabase
      .from("call_artifacts")
      .insert({
        call_id: call.id,
        workspace_id: context.workspaceId,
        kind: "audio",
        file_name: fileName,
        processing_status: "queued",
        metadata: { blobUrl: audioBlobUrl },
      })
      .select("id")
      .single()

    if (artifactError || !artifact) {
      revalidateTag(`workspace-${context.workspaceId}`, "max")
      return NextResponse.json({ error: artifactError?.message ?? "Unable to create call artifact" }, { status: 400 })
    }

    const { createProcessingJob } = await import("@/lib/jobs/service")
    const { dispatchProcessingJob } = await import("@/lib/jobs/dispatch")
    const job = await createProcessingJob(admin as any, {
      workspaceId: context.workspaceId,
      entityType: "call",
      entityId: call.id,
      jobType: "call_transcription",
      provider: "whisper",
    })
    dispatchProcessingJob(job.id).catch((err) => {
      console.error("[api] audio dispatch failed", { callId: call.id, error: err instanceof Error ? err.message : err })
    })

    revalidateTag(`workspace-${context.workspaceId}`, "max")
    return NextResponse.json({ id: call.id })
  }

  if (hasFile && !isAudioFile(uploadedFile.name)) {
    if (isPlainTextFile(uploadedFile.name)) {
      const text = (await uploadedFile.text()).trim()
      const { error: artifactError } = await supabase.from("call_artifacts").insert({
        call_id: call.id,
        workspace_id: context.workspaceId,
        kind: "transcript",
        file_name: uploadedFile.name,
        mime_type: uploadedFile.type || null,
        transcript_text: text || null,
        processing_status: text ? "ready" : "failed",
        processing_error: text ? null : "File was empty.",
      })
      if (artifactError) {
        revalidateTag(`workspace-${context.workspaceId}`, "max")
        return NextResponse.json({ error: artifactError.message }, { status: 400 })
      }
    } else {
      const buffer = Buffer.from(await uploadedFile.arrayBuffer())
      const safeFileName = basename(uploadedFile.name).replace(/[^a-zA-Z0-9._-]/g, "_") || "document"
      const blob = await put(`calls/${call.id}/${safeFileName}`, buffer, { access: "public" })

      const { data: artifact, error: artifactError } = await admin
        .from("call_artifacts")
        .insert({
          call_id: call.id,
          workspace_id: context.workspaceId,
          kind: "transcript",
          file_name: uploadedFile.name,
          mime_type: uploadedFile.type || null,
          processing_status: "processing",
          metadata: { blobUrl: blob.url },
        })
        .select("id")
        .single()

      if (artifactError || !artifact) {
        revalidateTag(`workspace-${context.workspaceId}`, "max")
        return NextResponse.json({ error: artifactError?.message ?? "Failed to create artifact" }, { status: 400 })
      }

      const parseResult = await submitLlamaParseJob({
        blobUrl: blob.url,
        fileName: uploadedFile.name,
        workspaceId: context.workspaceId,
        sourceDocumentId: artifact.id,
      })

      if ("error" in parseResult) {
        await admin.from("call_artifacts").update({
          processing_status: "failed",
          processing_error: parseResult.error,
        }).eq("id", artifact.id)
      } else {
        await admin.from("call_artifacts").update({
          metadata: { blobUrl: blob.url, llamaJobId: parseResult.jobId },
        }).eq("id", artifact.id)
      }
    }
  }

  if (transcriptText) {
    const { error: artifactError } = await supabase.from("call_artifacts").insert({
      call_id: call.id,
      workspace_id: context.workspaceId,
      kind: "transcript",
      file_name: `${call.id}-transcript.txt`,
      mime_type: "text/plain",
      transcript_text: transcriptText,
      processing_status: "ready",
    })

    if (artifactError) {
      revalidateTag(`workspace-${context.workspaceId}`, "max")
      return NextResponse.json({ error: artifactError.message }, { status: 400 })
    }
  }

  const processingStatus = await syncCallProcessingStatus(call.id)
  if (processingStatus === "ready") {
    await maybeQueueNextCallJobs(call.id)
  }

  revalidateTag(`workspace-${context.workspaceId}`, "max")
  return NextResponse.json({ id: call.id })
}
