import type { User } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { scheduleRubricGenerationForPlaybook } from "@/lib/jobs/rubric"
import { extractTextFromUrl, isPlainTextFile } from "@/lib/extraction/document"
import { submitLlamaParseJob, getLlamaParseApiKey, pollLlamaParseJobResult, getLlamaParseWebhookUrl } from "@/lib/integrations/llamaparse"
import { syncPlaybookProcessingStatus } from "@/lib/data/processing-status"

export interface BuilderCategoryInput {
  id: string
  name: string
  weight: number
  criteria: string[]
}

export interface BuilderFileInput {
  name: string
  size: number
  type: string
  file: File
}

export interface BuilderBlobSource {
  url: string
  name: string
  size: number
  type: string
}

export interface BuilderPayload {
  name: string
  description: string
  segment: string
  methodology: string
  callTypes: string[]
  notes: string
  categories: BuilderCategoryInput[]
  uploadedFiles: BuilderFileInput[]
  blobSources?: BuilderBlobSource[]
}

function buildPlaybookSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function deriveSourceType(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "txt"
  return ext === "md" ? "markdown" : ext
}

async function saveRubric(
  workspaceId: string,
  playbookId: string,
  categories: BuilderCategoryInput[]
) {
  const admin = createAdminClient()

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index]
    const { data: createdCategory, error: categoryError } = await admin
      .from("playbook_categories")
      .insert({
        playbook_id: playbookId,
        workspace_id: workspaceId,
        name: category.name,
        weight: category.weight,
        position: index,
      })
      .select("id")
      .single()

    if (categoryError || !createdCategory) {
      throw categoryError ?? new Error("Unable to create playbook category")
    }

    const criteriaPayload = category.criteria.map((criterion, criterionIndex) => ({
      playbook_category_id: createdCategory.id,
      workspace_id: workspaceId,
      criterion,
      position: criterionIndex,
    }))

    if (criteriaPayload.length > 0) {
      const { error: criteriaError } = await admin.from("playbook_criteria").insert(criteriaPayload)
      if (criteriaError) {
        throw criteriaError
      }
    }
  }
}

async function clearRubric(playbookId: string) {
  const admin = createAdminClient()
  const { data: existingCategories, error: categoryFetchError } = await admin
    .from("playbook_categories")
    .select("id")
    .eq("playbook_id", playbookId)

  if (categoryFetchError) {
    throw categoryFetchError
  }

  const existingCategoryIds = (existingCategories ?? []).map((category) => category.id)
  if (existingCategoryIds.length > 0) {
    const { error: criteriaDeleteError } = await admin
      .from("playbook_criteria")
      .delete()
      .in("playbook_category_id", existingCategoryIds)

    if (criteriaDeleteError) {
      throw criteriaDeleteError
    }
  }

  const { error: categoryDeleteError } = await admin.from("playbook_categories").delete().eq("playbook_id", playbookId)
  if (categoryDeleteError) {
    throw categoryDeleteError
  }
}

// Routes a source document to the right extraction path:
// - Plain text files (TXT, MD, CSV): extracted inline immediately, marked ready
// - Everything else (PDF, DOCX, PPTX, images): submitted to LlamaParse for
//   visual-aware parsing. If a webhook URL is configured the result arrives
//   asynchronously; otherwise we poll synchronously (local dev without ngrok).
async function extractAndStoreSourceDoc(input: {
  sourceDocumentId: string
  blobUrl: string
  fileName: string
  workspaceId: string
  playbookId: string
}) {
  const admin = createAdminClient()

  if (isPlainTextFile(input.fileName)) {
    try {
      const text = await extractTextFromUrl(input.blobUrl, input.fileName)
      await admin
        .from("playbook_source_documents")
        .update({ pasted_content: text || null, processing_status: "ready", processing_error: null })
        .eq("id", input.sourceDocumentId)
    } catch (error) {
      await admin
        .from("playbook_source_documents")
        .update({
          processing_status: "failed",
          processing_error: error instanceof Error ? error.message : "Text extraction failed",
        })
        .eq("id", input.sourceDocumentId)
      await syncPlaybookProcessingStatus(input.playbookId).catch(() => null)
    }
    return
  }

  // Rich document — submit to LlamaParse
  const result = await submitLlamaParseJob({
    blobUrl: input.blobUrl,
    fileName: input.fileName,
    workspaceId: input.workspaceId,
    sourceDocumentId: input.sourceDocumentId,
  })

  if ("error" in result) {
    await admin
      .from("playbook_source_documents")
      .update({ processing_status: "failed", processing_error: result.error })
      .eq("id", input.sourceDocumentId)
    await syncPlaybookProcessingStatus(input.playbookId).catch(() => null)
    return
  }

  await admin
    .from("playbook_source_documents")
    .update({ llama_job_id: result.jobId, processing_status: "processing" })
    .eq("id", input.sourceDocumentId)

  // If no webhook URL (local dev without ngrok), poll synchronously so rubric
  // generation can proceed without waiting for an external ping.
  if (!getLlamaParseWebhookUrl()) {
    const apiKey = await getLlamaParseApiKey(input.workspaceId)
    if (apiKey) {
      const pollResult = await pollLlamaParseJobResult(result.jobId, apiKey)
      if ("markdown" in pollResult) {
        await admin
          .from("playbook_source_documents")
          .update({ pasted_content: pollResult.markdown, processing_status: "ready", processing_error: null })
          .eq("id", input.sourceDocumentId)
        await maybeScheduleRubricIfAllSourcesReady(input.workspaceId, input.playbookId)
      } else {
        await admin
          .from("playbook_source_documents")
          .update({ processing_status: "failed", processing_error: pollResult.error })
          .eq("id", input.sourceDocumentId)
        await syncPlaybookProcessingStatus(input.playbookId).catch(() => null)
      }
    }
  }
  // With webhook: stays in "processing" until the webhook handler marks it ready
}

export async function maybeScheduleRubricIfAllSourcesReady(workspaceId: string, playbookId: string) {
  const admin = createAdminClient()
  const { data: docs } = await admin
    .from("playbook_source_documents")
    .select("processing_status")
    .eq("playbook_id", playbookId)

  const allReady = (docs ?? []).every((doc) => doc.processing_status === "ready")
  if (allReady) {
    await scheduleRubricGenerationForPlaybook({ workspaceId, playbookId })
  }
}

export async function createWorkspaceForManager({
  user,
  workspaceName,
  companyDomain,
  companyLogoUrl,
}: {
  user: User
  workspaceName: string
  companyDomain: string
  companyLogoUrl?: string
}) {
  const admin = createAdminClient()
  const normalizedWorkspaceName = workspaceName.trim()
  const normalizedCompanyDomain = companyDomain.trim().toLowerCase()

  if (!normalizedWorkspaceName) {
    throw new Error("Workspace name is required")
  }

  if (!normalizedCompanyDomain) {
    throw new Error("Company domain is required")
  }

  const { data: existingMembership } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("role", "manager")
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  if (existingMembership?.workspace_id) {
    const { error: updateWorkspaceError } = await admin
      .from("workspaces")
      .update({
        name: normalizedWorkspaceName,
        company_domain: normalizedCompanyDomain,
        company_logo_url: companyLogoUrl?.trim() || null,
      })
      .eq("id", existingMembership.workspace_id)

    if (updateWorkspaceError) {
      throw updateWorkspaceError
    }

    return { workspaceId: existingMembership.workspace_id, created: false }
  }

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .insert({
      name: normalizedWorkspaceName,
      company_domain: normalizedCompanyDomain,
      company_logo_url: companyLogoUrl?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (workspaceError || !workspace) {
    throw workspaceError ?? new Error("Unable to create workspace")
  }

  const { error: membershipError } = await admin.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: "manager",
    status: "active",
  })

  if (membershipError) {
    throw membershipError
  }

  return { workspaceId: workspace.id, created: true }
}

export async function createPlaybookForWorkspace({
  workspaceId,
  userId,
  payload,
  skipInitialRubric = false,
}: {
  workspaceId: string
  userId: string
  payload: BuilderPayload
  skipInitialRubric?: boolean
}): Promise<{ id: string; slug: string; processingStatus: string }> {
  const admin = createAdminClient()
  const blobSources = payload.blobSources ?? []
  const hasUploadedSources = payload.uploadedFiles.length > 0 || blobSources.length > 0 || payload.notes.trim().length > 0

  if (skipInitialRubric && !hasUploadedSources) {
    throw new Error("Add notes or upload at least one source file to generate a rubric.")
  }

  const slug = buildPlaybookSlug(payload.name)
  const sourceTypes = [
    ...payload.uploadedFiles.map((file) => deriveSourceType(file.name)),
    ...blobSources.map((source) => deriveSourceType(source.name)),
  ]

  const { data: playbook, error: playbookError } = await admin
    .from("playbooks")
    .insert({
      workspace_id: workspaceId,
      name: payload.name,
      slug,
      description: payload.description || null,
      target_segment: payload.segment || null,
      methodology: payload.methodology || null,
      status: "draft",
      processing_status: hasUploadedSources ? "processing" : "ready",
      applicable_call_types: payload.callTypes,
      source_types: sourceTypes,
      created_by: userId,
      published_at: null,
    })
    .select("id, slug, processing_status")
    .single()

  if (playbookError || !playbook) {
    throw playbookError ?? new Error("Unable to create playbook")
  }

  if (!skipInitialRubric) {
    await saveRubric(workspaceId, playbook.id, payload.categories)
  }

  // Notes are already text — insert directly as ready (no external service needed)
  if (payload.notes.trim().length > 0) {
    const { error: notesError } = await admin
      .from("playbook_source_documents")
      .insert({
        playbook_id: playbook.id,
        workspace_id: workspaceId,
        name: `${slug}-notes`,
        source_type: "prompt",
        pasted_content: payload.notes.trim(),
        processing_status: "ready",
      })

    if (notesError) {
      throw notesError
    }
  }

  // Extract text from each Blob URL synchronously; mark ready immediately
  for (const blob of blobSources) {
    const sourceType = deriveSourceType(blob.name)

    const { data: sourceDocument, error: docError } = await admin
      .from("playbook_source_documents")
      .insert({
        playbook_id: playbook.id,
        workspace_id: workspaceId,
        name: blob.name,
        source_type: sourceType,
        file_size_bytes: blob.size,
        processing_status: "queued",
      })
      .select("id")
      .single()

    if (docError || !sourceDocument) {
      throw docError ?? new Error("Unable to create playbook source document")
    }

    await extractAndStoreSourceDoc({
      sourceDocumentId: sourceDocument.id,
      blobUrl: blob.url,
      fileName: blob.name,
      workspaceId,
      playbookId: playbook.id,
    })
  }

  // Plain text sources are ready immediately; LlamaParse sources stay in
  // "processing" until the webhook fires. Only schedule rubric gen now if
  // all sources are already ready (i.e. all were plain text).
  await admin.from("playbooks").update({ processing_status: "processing" }).eq("id", playbook.id)
  await maybeScheduleRubricIfAllSourcesReady(workspaceId, playbook.id)

  return { id: playbook.id, slug: playbook.slug, processingStatus: "processing" }
}

export async function updatePlaybookSetupForWorkspace({
  workspaceId,
  playbookId,
  payload,
}: {
  workspaceId: string
  playbookId: string
  payload: BuilderPayload
}): Promise<{ id: string; slug: string; processingStatus: string }> {
  const admin = createAdminClient()
  const slug = buildPlaybookSlug(payload.name)
  const normalizedNotes = payload.notes.trim()
  const { data: existingSources, error: sourceFetchError } = await admin
    .from("playbook_source_documents")
    .select("id, name, source_type, processing_status")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: true })

  if (sourceFetchError) {
    throw sourceFetchError
  }

  const hasExistingSources = (existingSources ?? []).length > 0
  const hasBlobSources = (payload.blobSources ?? []).length > 0
  if (!hasExistingSources && payload.uploadedFiles.length === 0 && !hasBlobSources && normalizedNotes.length === 0) {
    throw new Error("Add notes or upload at least one source file to generate a rubric.")
  }

  await clearRubric(playbookId)

  const sourceTypes = new Set(
    (existingSources ?? [])
      .filter((source) => source.source_type !== "prompt")
      .map((source) => source.source_type)
  )
  if (normalizedNotes.length > 0) {
    sourceTypes.add("prompt")
  }
  payload.uploadedFiles.forEach((file) => sourceTypes.add(deriveSourceType(file.name)))
  ;(payload.blobSources ?? []).forEach((blob) => sourceTypes.add(deriveSourceType(blob.name)))

  const { data: updatedPlaybook, error: playbookError } = await admin
    .from("playbooks")
    .update({
      name: payload.name,
      slug,
      description: payload.description || null,
      target_segment: payload.segment || null,
      methodology: payload.methodology || null,
      applicable_call_types: payload.callTypes,
      source_types: Array.from(sourceTypes),
      processing_status: "processing",
    })
    .eq("id", playbookId)
    .eq("workspace_id", workspaceId)
    .select("id, slug, processing_status")
    .single()

  if (playbookError || !updatedPlaybook) {
    throw playbookError ?? new Error("Unable to update playbook")
  }

  // Update or insert notes (text is already available — mark ready immediately)
  const existingPromptSource = (existingSources ?? []).find((source) => source.source_type === "prompt")
  if (normalizedNotes.length > 0) {
    if (existingPromptSource) {
      const { error } = await admin
        .from("playbook_source_documents")
        .update({ name: `${slug}-notes`, pasted_content: normalizedNotes, processing_status: "ready", processing_error: null })
        .eq("id", existingPromptSource.id)
      if (error) throw error
    } else {
      const { error } = await admin.from("playbook_source_documents").insert({
        playbook_id: playbookId,
        workspace_id: workspaceId,
        name: `${slug}-notes`,
        source_type: "prompt",
        pasted_content: normalizedNotes,
        processing_status: "ready",
      })
      if (error) throw error
    }
  } else if (existingPromptSource) {
    const { error } = await admin.from("playbook_source_documents").delete().eq("id", existingPromptSource.id)
    if (error) throw error
  }

  // Clean up previously failed file sources so re-upload replaces them cleanly
  const failedFileSourceIds = (existingSources ?? [])
    .filter((source) => source.source_type !== "prompt" && source.processing_status === "failed")
    .map((source) => source.id)

  if (failedFileSourceIds.length > 0) {
    const { error } = await admin.from("playbook_source_documents").delete().in("id", failedFileSourceIds)
    if (error) throw error
  }

  // Extract text from each new Blob URL synchronously; mark ready immediately
  for (const blob of payload.blobSources ?? []) {
    const sourceType = deriveSourceType(blob.name)
    const { data: sourceDocument, error: documentError } = await admin
      .from("playbook_source_documents")
      .insert({
        playbook_id: playbookId,
        workspace_id: workspaceId,
        name: blob.name,
        source_type: sourceType,
        file_size_bytes: blob.size,
        processing_status: "queued",
      })
      .select("id")
      .single()

    if (documentError || !sourceDocument) {
      throw documentError ?? new Error("Unable to create playbook source document")
    }

    await extractAndStoreSourceDoc({
      sourceDocumentId: sourceDocument.id,
      blobUrl: blob.url,
      fileName: blob.name,
      workspaceId,
      playbookId,
    })
  }

  await admin.from("playbooks").update({ processing_status: "processing" }).eq("id", playbookId)
  await maybeScheduleRubricIfAllSourcesReady(workspaceId, playbookId)

  return { id: updatedPlaybook.id, slug: updatedPlaybook.slug, processingStatus: "processing" }
}
