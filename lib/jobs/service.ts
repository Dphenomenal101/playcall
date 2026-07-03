import type { SupabaseClient } from "@supabase/supabase-js"

export type ProcessingJobStatus = "queued" | "processing" | "completed" | "failed" | "canceled"

export type ProcessingJobEntityType = "playbook" | "playbook_source_document" | "call" | "call_artifact" | "workspace"

export type ProcessingJobType =
  | "playbook_ingestion"
  | "rubric_generation"
  | "call_ingestion"
  | "call_transcription"
  | "buyer_enrichment"
  | "call_scoring"
  | "workspace_provider_sync"

export interface CreateProcessingJobInput {
  workspaceId: string
  entityType: ProcessingJobEntityType
  entityId: string
  jobType: ProcessingJobType
  createdBy?: string | null
  provider?: string | null
  payload?: Record<string, unknown>
}

export async function createProcessingJob(
  client: SupabaseClient,
  input: CreateProcessingJobInput
) {
  const { data, error } = await client
    .from("processing_jobs")
    .insert({
      workspace_id: input.workspaceId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      job_type: input.jobType,
      provider: input.provider ?? null,
      payload: input.payload ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single()

  if (error || !data) {
    throw error ?? new Error("Unable to create processing job")
  }

  return data
}

export async function findActiveProcessingJob(
  client: SupabaseClient,
  input: Pick<CreateProcessingJobInput, "entityType" | "entityId" | "jobType">
) {
  const { data, error } = await client
    .from("processing_jobs")
    .select("*")
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .eq("job_type", input.jobType)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function ensureActiveProcessingJob(
  client: SupabaseClient,
  input: CreateProcessingJobInput
) {
  const existingJob = await findActiveProcessingJob(client, input)
  if (existingJob) {
    return { job: existingJob, created: false as const }
  }

  try {
    const job = await createProcessingJob(client, input)
    return { job, created: true as const }
  } catch (error: any) {
    if (error?.code !== "23505") {
      throw error
    }

    const racedJob = await findActiveProcessingJob(client, input)
    if (!racedJob) {
      throw error
    }

    return { job: racedJob, created: false as const }
  }
}

export async function updateProcessingJobStatus(
  client: SupabaseClient,
  jobId: string,
  status: ProcessingJobStatus,
  input?: {
    lastError?: string | null
    attemptCount?: number
    provider?: string | null
    payload?: Record<string, unknown>
  }
) {
  const nextPayload: Record<string, unknown> = {
    status,
    last_error: input?.lastError ?? null,
  }

  if (typeof input?.attemptCount === "number") {
    nextPayload.attempt_count = input.attemptCount
  }

  if (typeof input?.provider !== "undefined") {
    nextPayload.provider = input.provider
  }

  if (typeof input?.payload !== "undefined") {
    nextPayload.payload = input.payload
  }

  if (status === "processing") {
    nextPayload.started_at = new Date().toISOString()
  }

  if (status === "completed" || status === "failed" || status === "canceled") {
    nextPayload.completed_at = new Date().toISOString()
  }

  const { data, error } = await client
    .from("processing_jobs")
    .update(nextPayload)
    .eq("id", jobId)
    .select("*")
    .single()

  if (error || !data) {
    throw error ?? new Error("Unable to update processing job")
  }

  return data
}

export async function listEntityProcessingJobs(
  client: SupabaseClient,
  entityType: ProcessingJobEntityType,
  entityId: string
) {
  const { data, error } = await client
    .from("processing_jobs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  return data ?? []
}
