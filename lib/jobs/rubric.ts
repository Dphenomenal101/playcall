import { createAdminClient } from "@/lib/supabase/admin"
import { dispatchProcessingJob } from "@/lib/jobs/dispatch"
import { ensureActiveProcessingJob } from "@/lib/jobs/service"

export async function scheduleRubricGenerationForPlaybook({
  workspaceId,
  playbookId,
}: {
  workspaceId: string
  playbookId: string
}) {
  const admin = createAdminClient()

  const { data: completedJob } = await admin
    .from("processing_jobs")
    .select("id")
    .eq("entity_type", "playbook")
    .eq("entity_id", playbookId)
    .eq("job_type", "rubric_generation")
    .eq("status", "completed")
    .limit(1)
    .maybeSingle()

  if (completedJob) {
    // A rubric has already been generated for this playbook. Redundant Ragie
    // webhook deliveries (a document can fire document_status_updated multiple
    // times as it advances through indexed -> keyword_indexed -> ready) must
    // not trigger a second LLM run, which would also re-run the delete+reinsert
    // in savePlaybookRubric and momentarily empty playbook_categories.
    return { jobId: completedJob.id, created: false as const }
  }

  await admin.from("playbooks").update({ processing_status: "processing" }).eq("id", playbookId)

  const { job, created } = await ensureActiveProcessingJob(admin as any, {
    workspaceId,
    entityType: "playbook",
    entityId: playbookId,
    jobType: "rubric_generation",
    provider: "llm",
  })

  if (created) {
    await dispatchProcessingJob(job.id)
  }

  return { jobId: job.id, created }
}
