import { z } from "zod"
import { createAdminClient } from "../supabase/admin"
import { syncCallProcessingStatus } from "../data/processing-status"
import { transcribeAudioFromUrl } from "../extraction/audio"
import { createProcessingJob, updateProcessingJobStatus, type ProcessingJobType } from "./service"
import { dispatchProcessingJob } from "./dispatch"
import { scheduleRubricGenerationForPlaybook } from "./rubric"
import { enrichAccountContext } from "../enrichment/service"
import { generateStructuredObject, getWorkspaceProviderRuntimeConfig } from "../ai/providers"

const rubricSchema = z.object({
  summary: z.string(),
  categories: z
    .array(
      z.object({
        name: z.string(),
        weight: z.number().min(0).max(100),
        criteria: z.array(z.string().min(1)).min(1),
      })
    )
    .min(3)
    .max(8),
})

// Dimensions must score the manager's actual configured playbook categories,
// not a generic invented taxonomy ("Discovery/Qualification/Objection
// Handling/..."). Without this constraint the model defaults to a habitual
// SaaS-sales rubric shape, which can silently diverge from the real
// category set/weights the playbook was built with (e.g. inventing a
// standalone "Objection Handling" dimension when the playbook only has it
// as one criterion inside a broader category). The label enum is built
// per-call from the playbook's real categories, and .length() + .refine()
// below ensure every category appears exactly once, with no duplicates or
// invented labels.
function buildScoreSchema(categoryNames: string[]) {
  const dimensionSchema = z.object({
    label: categoryNames.length > 0 ? z.enum(categoryNames as [string, ...string[]]) : z.string(),
    // Always scored out of 10 - there's no reason this scale should vary
    // per dimension, so it isn't model-controlled (a model-supplied outOf
    // previously produced nonsense like "10/2.5" -> 400%).
    score: z.number().min(0).max(10),
    note: z.string(),
    evidence: z.array(
      z.object({
        title: z.string(),
        quote: z.string(),
      })
    ),
  })

  const dimensionsArray =
    categoryNames.length > 0
      ? z
          .array(dimensionSchema)
          .length(categoryNames.length)
          .refine(
            (dims) => {
              const labels = dims.map((dim) => dim.label)
              return new Set(labels).size === labels.length && categoryNames.every((name) => labels.includes(name))
            },
            { message: "dimensions must include exactly one entry per playbook category, with no duplicates or omissions" }
          )
      : z.array(dimensionSchema).min(3).max(8)

  return z.object({
    // overallScore is computed server-side from the weighted dimensions
    // below rather than asked of the model - having the model invent it
    // independently let it diverge from (and contradict) the category
    // breakdown shown right next to it on the scorecard.
    adherence: z.number().min(0).max(100),
    talkRatio: z.number().min(0).max(100).nullable().describe(
      "Percentage of the call's total words spoken by the REP, estimated from the transcript. Only null if speaker turns genuinely cannot be distinguished (e.g. an undiarized summary with no dialogue structure)."
    ),
    listenRatio: z.number().min(0).max(100).nullable().describe(
      "Percentage of the call's total words spoken by the BUYER/prospect (talkRatio + listenRatio should sum to ~100). Only null if speaker turns genuinely cannot be distinguished."
    ),
    // Capped to keep this concise (~20-30 words per the prompt instruction)
    // rather than a paragraph - 220 chars is a generous backstop, not the
    // target length itself.
    buyerAwareFeedback: z.string().max(220),
    bestMoment: z.string(),
    topMissedMoment: z.string(),
    missedQuestions: z.array(z.string()),
    missedOpportunities: z.array(z.string()),
    productInaccuracies: z.array(z.string()),
    recommendedCoachingDrill: z.string(),
    dimensions: dimensionsArray,
  })
}

const DIMENSION_SCORE_OUT_OF = 10

function normalizeTalkListenRatios(talkRatio: number | null, listenRatio: number | null) {
  if (talkRatio === null || listenRatio === null) {
    return { talkRatio: null, listenRatio: null }
  }

  // Some providers return a 0-1 fraction (e.g. 0.6/0.4) instead of the
  // 0-100 percentage the schema asks for. Detect that by the pair summing
  // to ~1 rather than ~100, and rescale so the UI always gets percentages.
  if (talkRatio + listenRatio <= 1.5) {
    return { talkRatio: Math.round(talkRatio * 100), listenRatio: Math.round(listenRatio * 100) }
  }

  return { talkRatio: Math.round(talkRatio), listenRatio: Math.round(listenRatio) }
}

// The model occasionally answers these 0-100 percentage fields using the
// same 0-10 scale as the per-dimension scores (e.g. returning 4 instead of
// 40). A genuine sub-10% score on a sales call is effectively unheard of,
// so treat anything <= 10 as a 0-10 answer and rescale it.
function normalizePercentScore(value: number) {
  return value <= 10 ? Math.round(value * 10) : Math.round(value)
}

// overallScore must reconcile with the category breakdown shown right next
// to it, so it's derived from the actual weighted dimensions instead of a
// second number the model invents independently (which previously produced
// scores like 4/100 against a dimension average of ~35%).
function computeWeightedOverallScore(dimensions: Array<{ label: string; score: number }>, weightByName: Map<string, number>) {
  if (dimensions.length === 0) {
    return 0
  }

  const totalWeight = dimensions.reduce((sum, dimension) => sum + (weightByName.get(dimension.label) ?? 0), 0)

  if (totalWeight <= 0) {
    const average = dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length
    return Math.round(average * 10)
  }

  const weightedSum = dimensions.reduce((sum, dimension) => {
    const weight = weightByName.get(dimension.label) ?? 0
    return sum + (dimension.score / DIMENSION_SCORE_OUT_OF) * weight
  }, 0)

  return Math.round((weightedSum / totalWeight) * 100)
}

function sumWeights(categories: Array<{ weight: number }>) {
  return categories.reduce((total, category) => total + category.weight, 0)
}

function normalizeCategoryWeights(categories: Array<{ name: string; weight: number; criteria: string[] }>) {
  const total = sumWeights(categories)
  if (total === 100 || total === 0) {
    return categories
  }

  return categories.map((category) => ({
    ...category,
    weight: Math.round((category.weight / total) * 100),
  }))
}

async function savePlaybookRubric(workspaceId: string, playbookId: string, categories: Array<{ name: string; weight: number; criteria: string[] }>) {
  const admin = createAdminClient()
  const { data: existingCategories } = await admin.from("playbook_categories").select("id").eq("playbook_id", playbookId)
  const existingIds = (existingCategories ?? []).map((row) => row.id)

  if (existingIds.length > 0) {
    await admin.from("playbook_criteria").delete().in("playbook_category_id", existingIds)
    await admin.from("playbook_categories").delete().eq("playbook_id", playbookId)
  }

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index]
    const { data: createdCategory, error } = await admin
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

    if (error || !createdCategory) {
      throw error ?? new Error("Unable to create playbook category")
    }

    if (category.criteria.length > 0) {
      const { error: criteriaError } = await admin.from("playbook_criteria").insert(
        category.criteria.map((criterion, criterionIndex) => ({
          playbook_category_id: createdCategory.id,
          workspace_id: workspaceId,
          criterion,
          position: criterionIndex,
        }))
      )

      if (criteriaError) {
        throw criteriaError
      }
    }
  }
}

async function processRubricGenerationJob(job: any) {
  const admin = createAdminClient()
  const { data: playbook, error: playbookError } = await admin
    .from("playbooks")
    .select("id, workspace_id, name, description, target_segment, methodology, applicable_call_types")
    .eq("id", job.entity_id)
    .single()

  if (playbookError || !playbook) {
    throw playbookError ?? new Error("Playbook not found")
  }

  const { data: sourceDocs, error: sourceError } = await admin
    .from("playbook_source_documents")
    .select("id, name, pasted_content, processing_status")
    .eq("playbook_id", playbook.id)
    .order("created_at", { ascending: true })

  if (sourceError) {
    throw sourceError
  }

  // Concatenate all extracted text from source documents directly into the
  // prompt. No RAG retrieval step — source docs are extracted and stored as
  // pasted_content at upload time, so the full text is available immediately.
  const sourceText = (sourceDocs ?? [])
    .map((doc) => doc.pasted_content)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((text, index) => `[Source ${index + 1}]\n${text}`)
    .join("\n\n")

  const { providerId, modelId, object } = await generateStructuredObject({
    workspaceId: playbook.workspace_id,
    schema: rubricSchema,
    schemaName: "playbook_rubric",
    schemaDescription: "A scored sales-call rubric with categories, weights, and criteria.",
    prompt: [
      "Create a sales-call scoring rubric from the provided playbook material.",
      "Return 3 to 8 categories.",
      "Weights must sum to 100.",
      "Criteria should be concise, observable behaviors used in scoring.",
      `Playbook name: ${playbook.name}`,
      `Description: ${playbook.description ?? "none"}`,
      `Segment: ${playbook.target_segment ?? "unknown"}`,
      `Methodology: ${playbook.methodology ?? "unknown"}`,
      `Call types: ${Array.isArray(playbook.applicable_call_types) ? playbook.applicable_call_types.join(", ") : ""}`,
      "",
      "Source material:",
      sourceText || "No source material provided — generate a general rubric based on the playbook metadata above.",
    ].join("\n"),
  })

  const normalizedCategories = normalizeCategoryWeights(object.categories)
  await savePlaybookRubric(playbook.workspace_id, playbook.id, normalizedCategories)

  await admin
    .from("playbook_generation_runs")
    .insert({
      workspace_id: playbook.workspace_id,
      playbook_id: playbook.id,
      processing_job_id: job.id,
      provider: providerId,
      model: modelId,
      status: "completed",
      source_document_ids: (sourceDocs ?? []).map((doc) => doc.id),
      generated_summary: object.summary,
      metadata: {
        source_doc_count: (sourceDocs ?? []).length,
        source_text_chars: sourceText.length,
      },
    })
    .select("id")
    .maybeSingle()

  await admin.from("playbooks").update({ processing_status: "ready" }).eq("id", playbook.id)
}

async function processCallTranscriptionJob(job: any) {
  const admin = createAdminClient()

  const { data: call, error: callError } = await admin
    .from("calls")
    .select("id, workspace_id")
    .eq("id", job.entity_id)
    .single()

  if (callError || !call) {
    throw callError ?? new Error("Call not found")
  }

  const { data: artifacts, error: artifactError } = await admin
    .from("call_artifacts")
    .select("id, kind, file_name, transcript_text, metadata")
    .eq("call_id", call.id)
    .eq("kind", "audio")

  if (artifactError) {
    throw artifactError
  }

  for (const artifact of artifacts ?? []) {
    if (typeof artifact.transcript_text === "string" && artifact.transcript_text.trim().length > 0) {
      continue
    }

    const blobUrl = typeof (artifact.metadata as any)?.blobUrl === "string" ? (artifact.metadata as any).blobUrl : null
    if (!blobUrl) {
      await admin
        .from("call_artifacts")
        .update({
          processing_status: "failed",
          processing_error: "Audio file URL not found. Re-submit the call with the recording.",
        })
        .eq("id", artifact.id)
      continue
    }

    try {
      const transcript = await transcribeAudioFromUrl(blobUrl, artifact.file_name ?? "audio.mp3", call.workspace_id)

      await admin
        .from("call_artifacts")
        .update({
          transcript_text: transcript,
          processing_status: "ready",
          processing_error: null,
        })
        .eq("id", artifact.id)
    } catch (error) {
      await admin
        .from("call_artifacts")
        .update({
          processing_status: "failed",
          processing_error: error instanceof Error ? error.message : "Transcription failed",
        })
        .eq("id", artifact.id)
      throw error
    }
  }

  await syncCallProcessingStatus(call.id)
  await maybeQueueNextCallJobs(call.id)
}

async function getCallTranscript(callId: string) {
  const admin = createAdminClient()
  const { data: artifacts } = await admin
    .from("call_artifacts")
    .select("transcript_text")
    .eq("call_id", callId)
    .order("created_at", { ascending: true })

  for (const artifact of artifacts ?? []) {
    if (typeof artifact.transcript_text === "string" && artifact.transcript_text.trim().length > 0) {
      return artifact.transcript_text
    }
  }

  return ""
}

async function processCallScoringJob(job: any) {
  const admin = createAdminClient()
  const { data: call, error: callError } = await admin
    .from("calls")
    .select("*")
    .eq("id", job.entity_id)
    .single()

  if (callError || !call) {
    throw callError ?? new Error("Call not found")
  }

  const transcript = await getCallTranscript(call.id)
  if (!transcript.trim()) {
    throw new Error("Transcript is not available yet")
  }

  const [{ data: playbook }, { data: categories }] = await Promise.all([
    admin
      .from("playbooks")
      .select("id, name, description, methodology, target_segment, applicable_call_types")
      .eq("id", call.playbook_id)
      .single(),
    admin.from("playbook_categories").select("*").eq("playbook_id", call.playbook_id).order("position", { ascending: true }),
  ])

  const categoryIds = (categories ?? []).map((c) => c.id)
  const { data: criteria } = categoryIds.length > 0
    ? await admin
        .from("playbook_criteria")
        .select("playbook_category_id, criterion, position")
        .in("playbook_category_id", categoryIds)
        .order("position", { ascending: true })
    : { data: [] }

  const criteriaByCategory = new Map<string, string[]>()
  for (const row of criteria ?? []) {
    const current = criteriaByCategory.get(row.playbook_category_id) ?? []
    current.push(row.criterion)
    criteriaByCategory.set(row.playbook_category_id, current)
  }

  const categoryNames = (categories ?? []).map((category) => category.name)
  const categoryWeightByName = new Map((categories ?? []).map((category) => [category.name, Number(category.weight)]))

  const rubricSummary = (categories ?? [])
    .map((category) => `${category.name} (${Number(category.weight)}): ${(criteriaByCategory.get(category.id) ?? []).join("; ")}`)
    .join("\n")

  const { providerId, modelId, object } = await generateStructuredObject({
    workspaceId: call.workspace_id,
    schema: buildScoreSchema(categoryNames),
    schemaName: "call_scorecard",
    schemaDescription: "A buyer-aware sales call scorecard with detailed coaching feedback.",
    prompt: [
      "You are a skeptical, experienced sales manager grading a rep's call for a pipeline review.",
      "Score the sales call against the rubric below and return a buyer-aware scorecard.",
      "Use the transcript evidence to justify dimension scores.",
      "",
      categoryNames.length > 0
        ? [
            "The \"dimensions\" array must contain exactly one entry per playbook category listed below,",
            "using the category name exactly as its label - do not invent, rename, split, merge, or omit",
            "categories, and do not fall back to a generic sales taxonomy (e.g. a standalone \"Objection",
            "Handling\" dimension) if that is not one of these actual categories:",
            categoryNames.map((name) => `- ${name}`).join("\n"),
          ].join("\n")
        : "",
      "",
      "Calibrate scores strictly - do not let a pleasant or friendly conversation inflate scores for",
      "a category whose actual objective was not achieved. A good conversation is not the same as good execution.",
      "Score each category against what it is actually supposed to accomplish (its specific criteria below),",
      "not how the call felt, using this calibration band (expressed as a percentage of the objective achieved):",
      "- 90-100%: Nearly every relevant objective for this category was clearly met, with strong transcript evidence.",
      "- 70-89%: Most objectives were met; minor gaps remain.",
      "- 50-69%: Mixed or partial execution; meaningful objectives were left unaddressed.",
      "- 30-49%: Mostly missed; only superficial or token effort toward the category's objective.",
      "- 0-29%: Absent or actively counterproductive.",
      "IMPORTANT - apply that same percentage calibration consistently across fields with different scales:",
      "\"adherence\" is on a 0-100 scale (e.g. mostly-missed adherence is 30-49, NOT 3-4).",
      "Each dimensions[].score is the same calibrated judgment expressed out of 10 instead of out of 100",
      "(divide the percentage by 10, e.g. mostly-missed is 3-4 out of 10) - never write a 0-10 number into",
      "a 0-100 field or vice versa.",
      "A category whose criteria are about qualification-style discovery (budget, champion, buying committee,",
      "evaluation criteria, procurement process, urgency, timeline, current initiative owner): the absence of",
      "that information is itself a negative signal, not a neutral one. A single unanswered or deflected",
      "question (e.g. \"Do you have a timeline?\" / \"Not really.\") with no follow-up probing means those",
      "objectives were not met, and the score must land in the 30-49% range, not 70-89%, regardless of how",
      "cordial the exchange was.",
      "A category about product/solution positioning: positioning a product (\"we handle X so you can do Y\")",
      "without quantified value, proof points, customer evidence, or tailoring to the buyer's specific",
      "architecture is surface-level, not strong execution - score accordingly rather than rewarding confident",
      "delivery alone.",
      "A category about next steps: a next step only earns a high score if it has a committed time/date,",
      "named attendees, and a clear purpose. Vague language (\"maybe next week\", \"I'll send some info\")",
      "without those specifics is weak even if something nominally got scheduled.",
      "Do not penalize a category for an objection-handling criterion if the buyer never raised any objection",
      "to address - score that specific criterion's contribution as neutral-to-positive in that case rather",
      "than assuming failure, since you cannot fail to handle something that never came up.",
      "Transcripts may label speakers generically (e.g. \"Speaker 1\"/\"Speaker 2\") rather than naming the rep",
      "and buyer explicitly. Infer which speaker is the rep from context (the one steering discovery questions,",
      "presenting the product, proposing next steps) and estimate talkRatio/listenRatio as a word-count-based",
      "split between that rep and the other speaker(s) across the whole transcript - do not default to null",
      "just because the labels are generic; only use null if you genuinely cannot tell who is speaking at all.",
      "buyerAwareFeedback must be one tight sentence, about 20-30 words. Cite the single most important",
      "buyer-specific reason behind the call's overall trajectory - not a recap of every category, and not",
      "a generic qualification cliche that would apply to almost any call. If you can't name something",
      "specific enough to risk being wrong about, you haven't found the real reason yet - keep digging",
      "rather than padding the sentence with safe, generic advice.",
      `Company: ${call.company_name}`,
      `Contact: ${call.contact_name ?? "unknown"}`,
      `LinkedIn: ${call.contact_linkedin_url ?? "missing"}`,
      `Contact role: ${call.contact_role ?? "unknown"}`,
      `Deal stage before: ${call.deal_stage_before ?? "unknown"}`,
      `Deal stage after: ${call.deal_stage_after ?? "unknown"}`,
      `Call type: ${call.call_type}`,
      `Outcome: ${call.outcome ?? "unknown"}`,
      "",
      "Buyer context:",
      JSON.stringify(call.buyer_context ?? {}),
      "",
      "Playbook summary:",
      playbook ? `${playbook.name} - ${playbook.description ?? ""}` : "Unknown playbook",
      rubricSummary,
      "",
      "Transcript:",
      transcript,
    ].join("\n"),
  })

  const { data: existingScore } = await admin
    .from("call_scores")
    .select("id")
    .eq("call_id", call.id)
    .maybeSingle()

  let callScoreId = existingScore?.id ?? null
  if (callScoreId) {
    await admin.from("call_score_dimensions").delete().eq("call_score_id", callScoreId)
  }

  const { talkRatio, listenRatio } = normalizeTalkListenRatios(object.talkRatio, object.listenRatio)
  const overallScore = computeWeightedOverallScore(object.dimensions, categoryWeightByName)

  const scorePayload: Record<string, unknown> = {
    call_id: call.id,
    workspace_id: call.workspace_id,
    overall_score: overallScore,
    playbook_adherence: normalizePercentScore(object.adherence),
    talk_ratio: talkRatio,
    listen_ratio: listenRatio,
    buyer_aware_feedback: object.buyerAwareFeedback,
    best_moment: object.bestMoment,
    top_missed_moment: object.topMissedMoment,
    recommended_coaching_drill: object.recommendedCoachingDrill,
    missed_questions: object.missedQuestions,
    missed_opportunities: object.missedOpportunities,
    product_inaccuracies: object.productInaccuracies,
  }

  if (callScoreId) {
    await admin.from("call_scores").update(scorePayload).eq("id", callScoreId)
  } else {
    const { data: insertedScore, error: scoreError } = await admin
      .from("call_scores")
      .insert(scorePayload)
      .select("id")
      .single()

    if (scoreError || !insertedScore) {
      throw scoreError ?? new Error("Unable to save call score")
    }

    callScoreId = insertedScore.id
  }

  const { error: dimensionsError } = await admin.from("call_score_dimensions").insert(
    object.dimensions.map((dimension, index) => ({
      call_score_id: callScoreId,
      workspace_id: call.workspace_id,
      category_name: dimension.label,
      score: dimension.score,
      out_of: DIMENSION_SCORE_OUT_OF,
      summary_note: dimension.note,
      transcript_evidence: dimension.evidence.map((item) => ({
        title: item.title,
        quote: item.quote,
      })),
      position: index,
    }))
  )

  if (dimensionsError) {
    throw new Error(`Failed to save score dimensions: ${dimensionsError.message}`)
  }

  await admin.from("calls").update({
    scoring_summary: {
      provider: providerId,
      model: modelId,
      overallScore,
      adherence: object.adherence,
      buyerAwareFeedback: object.buyerAwareFeedback,
      recommendedCoachingDrill: object.recommendedCoachingDrill,
    },
    processing_status: "ready",
  }).eq("id", call.id)
}

async function processBuyerEnrichmentJob(job: any) {
  const admin = createAdminClient()
  const { data: call, error: callError } = await admin
    .from("calls")
    .select("*")
    .eq("id", job.entity_id)
    .single()

  if (callError || !call) {
    throw callError ?? new Error("Call not found")
  }

  if (!call.contact_linkedin_url && !call.contact_email) {
    throw new Error("A LinkedIn URL or contact email is required for live call scoring")
  }

  const enrichment = await enrichAccountContext({
    workspaceId: call.workspace_id,
    companyName: call.company_name ?? "",
    companyDomain: call.contact_email?.split("@")[1] ?? "",
    contactName: call.contact_name ?? "",
    contactEmail: call.contact_email ?? "",
    linkedinUrl: call.contact_linkedin_url ?? "",
    contactRole: call.contact_role ?? "",
  })

  await admin.from("calls").update({ buyer_context: enrichment.accountContext }).eq("id", call.id)
  await admin.from("enrichment_runs").insert({
    workspace_id: call.workspace_id,
    call_id: call.id,
    processing_job_id: job.id,
    provider: enrichment.providerId,
    status: "completed",
    request_identity: {
      linkedin_url: call.contact_linkedin_url,
      email: call.contact_email,
      contact_name: call.contact_name,
      company_name: call.company_name,
    },
    source_urls: enrichment.sourceUrls,
    field_confidence: enrichment.accountContext.confidence,
    normalized_output: enrichment.accountContext,
    raw_output: enrichment.rawOutput,
  })

  await admin.from("calls").update({ processing_status: "processing" }).eq("id", call.id)
  const { data: existingScore } = await admin
    .from("processing_jobs")
    .select("id")
    .eq("entity_type", "call")
    .eq("entity_id", call.id)
    .eq("job_type", "call_scoring")
    .in("status", ["queued", "processing", "completed"])
    .limit(1)
    .maybeSingle()

  if (!existingScore) {
    // Create the call_scoring job in queued state only — do NOT dispatch here.
    // Dispatching inline would run call_scoring inside the Edge Function (if this
    // processor is running there), causing a nested invocation that hits the 150s
    // wall-clock limit. The caller (dispatchProcessingJob in Next.js) picks up the
    // queued job and runs it locally after this job completes.
    await createProcessingJob(admin as any, {
      workspaceId: call.workspace_id,
      entityType: "call",
      entityId: call.id,
      jobType: "call_scoring",
      provider: "llm",
    })
  }
}

function mapDimensionToScoreColumn(label: string) {
  const normalized = label.toLowerCase()

  if (normalized.includes("discover")) return "discovery_quality"
  if (normalized.includes("qualif")) return "qualification"
  if (normalized.includes("objection")) return "objection_handling"
  if (normalized.includes("product")) return "product_accuracy"
  if (normalized.includes("next")) return "next_step_clarity"
  if (normalized.includes("adherence") || normalized.includes("playbook")) return "playbook_adherence"

  return null
}

export async function maybeQueueNextCallJobs(callId: string) {
  const admin = createAdminClient()
  const { data: call } = await admin
    .from("calls")
    .select("id, workspace_id, contact_linkedin_url, contact_email, processing_status, playbook_id")
    .eq("id", callId)
    .maybeSingle()

  if (!call || call.processing_status !== "ready") {
    return
  }

  const { data: existingEnrichment } = await admin
    .from("processing_jobs")
    .select("id")
    .eq("entity_type", "call")
    .eq("entity_id", call.id)
    .eq("job_type", "buyer_enrichment")
    .in("status", ["queued", "processing", "completed"])
    .limit(1)
    .maybeSingle()

  if (!existingEnrichment && (call.contact_linkedin_url || call.contact_email)) {
    await admin.from("calls").update({ processing_status: "processing" }).eq("id", call.id)
    const enrichmentConfig = await getWorkspaceProviderRuntimeConfig(call.workspace_id, "enrichment")
    const enrichmentJob = await createProcessingJob(admin as any, {
      workspaceId: call.workspace_id,
      entityType: "call",
      entityId: call.id,
      jobType: "buyer_enrichment",
      provider: enrichmentConfig?.providerId ?? "exa",
    })
    await dispatchProcessingJob(enrichmentJob.id)
    return
  }

  if (existingEnrichment) {
    const { data: existingScore } = await admin
      .from("processing_jobs")
      .select("id")
      .eq("entity_type", "call")
      .eq("entity_id", call.id)
      .eq("job_type", "call_scoring")
      .in("status", ["queued", "processing", "completed"])
      .limit(1)
      .maybeSingle()

    if (!existingScore) {
      await admin.from("calls").update({ processing_status: "processing" }).eq("id", call.id)
      const scoreJob = await createProcessingJob(admin as any, {
        workspaceId: call.workspace_id,
        entityType: "call",
        entityId: call.id,
        jobType: "call_scoring",
        provider: "llm",
      })
      await dispatchProcessingJob(scoreJob.id)
    }
  }
}

export async function prepareCallRetry(callId: string, workspaceId: string) {
  const admin = createAdminClient()
  const { data: call } = await admin
    .from("calls")
    .select("id, workspace_id, processing_status")
    .eq("id", callId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (!call) {
    throw new Error("Call not found")
  }

  if (call.processing_status !== "failed") {
    throw new Error("Call is not in a failed state")
  }

  const { data: lastFailedJob } = await admin
    .from("processing_jobs")
    .select("job_type, provider")
    .eq("entity_type", "call")
    .eq("entity_id", callId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let jobType: ProcessingJobType = lastFailedJob?.job_type ?? "call_scoring"
  const provider = lastFailedJob?.provider ?? null

  if (!lastFailedJob) {
    const { data: failedArtifact } = await admin
      .from("call_artifacts")
      .select("id, kind")
      .eq("call_id", callId)
      .eq("processing_status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!failedArtifact) {
      throw new Error("No failed job found for this call")
    }

    jobType = failedArtifact.kind === "audio" ? "call_transcription" : "call_scoring"
  }

  await admin.from("calls").update({ processing_status: "processing" }).eq("id", callId)

  const retryJob = await createProcessingJob(admin as any, {
    workspaceId: call.workspace_id,
    entityType: "call",
    entityId: callId,
    jobType,
    provider,
  })

  return { jobId: retryJob.id as string }
}

export async function retryFailedCallProcessing(callId: string, workspaceId: string) {
  const { jobId } = await prepareCallRetry(callId, workspaceId)
  await dispatchProcessingJob(jobId)
}

async function markParentEntityFailed(job: { job_type: string; entity_id: string; entity_type: string }) {
  const admin = createAdminClient()

  try {
    if (job.job_type === "rubric_generation") {
      await admin.from("playbooks").update({ processing_status: "failed" }).eq("id", job.entity_id)
      return
    }

    if (job.job_type === "call_transcription" || job.job_type === "call_scoring" || job.job_type === "buyer_enrichment") {
      await admin.from("calls").update({ processing_status: "failed" }).eq("id", job.entity_id)
    }
  } catch {
    // Best-effort status propagation; never mask the original processing error.
  }
}

async function markParentEntityProcessing(job: { job_type: string; entity_id: string; entity_type: string }) {
  const admin = createAdminClient()

  try {
    if (job.job_type === "rubric_generation") {
      await admin.from("playbooks").update({ processing_status: "processing" }).eq("id", job.entity_id)
      return
    }

    if (job.job_type === "call_transcription" || job.job_type === "call_scoring" || job.job_type === "buyer_enrichment") {
      await admin.from("calls").update({ processing_status: "processing" }).eq("id", job.entity_id)
    }
  } catch {
    // Best-effort status propagation - never block the actual retry on this.
  }
}

export async function processJobById(jobId: string) {
  const admin = createAdminClient()

  // Atomic claim: guard by the job's prior status on the UPDATE itself (not
  // a separate SELECT-then-UPDATE, which would leave a window for two
  // concurrent calls to both pass the check and both proceed).
  const { data: claimedJob, error: claimError } = await admin
    .from("processing_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "failed"])
    .select("*")
    .maybeSingle()

  if (claimError) {
    throw claimError
  }

  if (!claimedJob) {
    return
  }

  const job = claimedJob

  await updateProcessingJobStatus(admin as any, job.id, "processing", {
    attemptCount: Number(job.attempt_count ?? 0) + 1,
    provider: job.provider,
    payload: (job.payload as Record<string, unknown> | null) ?? {},
  })
  await markParentEntityProcessing(job)

  try {
    switch (job.job_type) {
      case "rubric_generation":
        await processRubricGenerationJob(job)
        break
      case "call_transcription":
        await processCallTranscriptionJob(job)
        break
      case "buyer_enrichment":
        await processBuyerEnrichmentJob(job)
        break
      case "call_scoring":
        await processCallScoringJob(job)
        break
      default:
        throw new Error(`Unsupported job type: ${job.job_type}`)
    }

    await updateProcessingJobStatus(admin as any, job.id, "completed", {
      attemptCount: Number(job.attempt_count ?? 0) + 1,
      provider: job.provider,
      payload: (job.payload as Record<string, unknown> | null) ?? {},
    })
  } catch (processorError) {
    const message = processorError instanceof Error ? processorError.message : "Processing failed"
    await updateProcessingJobStatus(admin as any, job.id, "failed", {
      attemptCount: Number(job.attempt_count ?? 0) + 1,
      lastError: message,
      provider: job.provider,
      payload: (job.payload as Record<string, unknown> | null) ?? {},
    })
    await markParentEntityFailed(job)
    throw processorError
  }
}
