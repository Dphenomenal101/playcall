import type { SupabaseClient } from "@supabase/supabase-js"
import { unstable_cache } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentMembership } from "@/lib/data/auth"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import type { AccountContext, CallRecord, PendingInvite, PlaybookCategory, PlaybookRecord, PlaybookSourceDocument, RepAssignment, ScoreDimension } from "@/lib/playcall-data"
import type { ManagerWorkspaceData, RepWorkspaceData, WorkspaceViewer } from "@/lib/data/workspace-types"
import { buildManagerAnalytics, buildRepAnalytics } from "@/lib/data/live-analytics"
import { humanizeProcessingError } from "@/lib/jobs/error-messages"
import { getMissingRequiredProviderRoles } from "@/lib/ai/providers"

type Role = "manager" | "rep"

function formatDate(value: string | null | undefined) {
  if (!value) return "—"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function titleizeRole(role: Role) {
  return role === "manager" ? "Manager" : "Sales Rep"
}

function normalizeInviteRole(role: Role) {
  return role === "manager" ? "Manager" : "Sales Rep"
}

function normalizeAccountContext(raw: any, call: any): AccountContext {
  const accountContext = raw && typeof raw === "object" ? raw : {}
  const company = accountContext.company && typeof accountContext.company === "object" ? accountContext.company : {}
  const contact = accountContext.contact && typeof accountContext.contact === "object" ? accountContext.contact : {}
  const confidence = accountContext.confidence && typeof accountContext.confidence === "object" ? accountContext.confidence : {}
  const sources = accountContext.sources && typeof accountContext.sources === "object" ? accountContext.sources : {}

  return {
    company: {
      name: company.name ?? call.company_name ?? null,
      domain: company.domain ?? (typeof call.contact_email === "string" ? call.contact_email.split("@")[1] ?? "" : ""),
      employeeBand: company.employeeBand ?? null,
      stage: company.stage ?? "unknown",
      industry: company.industry ?? null,
      businessModel: company.businessModel ?? null,
      salesMotion: company.salesMotion ?? "unknown",
      pricingModel: company.pricingModel ?? "unknown",
      productSummary: company.productSummary ?? null,
      targetCustomer: company.targetCustomer ?? null,
      likelyUseCase: company.likelyUseCase ?? null,
      relevantTechnologies: Array.isArray(company.relevantTechnologies) ? company.relevantTechnologies : [],
      recentSignals: Array.isArray(company.recentSignals) ? company.recentSignals : [],
      buyingStageHypothesis: company.buyingStageHypothesis ?? "unknown",
    },
    contact: {
      name: contact.name ?? call.contact_name ?? null,
      email: contact.email ?? call.contact_email ?? null,
      linkedinUrl: contact.linkedinUrl ?? call.contact_linkedin_url ?? null,
      title: contact.title ?? call.contact_role ?? null,
      department: contact.department ?? null,
      seniority: contact.seniority ?? "unknown",
      likelyRoleInPurchase: contact.likelyRoleInPurchase ?? "unknown",
    },
    confidence: {
      company: typeof confidence.company === "number" ? confidence.company : 0,
      contact: typeof confidence.contact === "number" ? confidence.contact : 0,
      stage: typeof confidence.stage === "number" ? confidence.stage : 0,
      salesMotion: typeof confidence.salesMotion === "number" ? confidence.salesMotion : 0,
    },
    sources: {
      company: Array.isArray(sources.company) ? sources.company : [],
      contact: Array.isArray(sources.contact) ? sources.contact : [],
      retrievedAt: sources.retrievedAt ?? new Date().toISOString(),
    },
  }
}

export async function getLiveViewerContext(requiredRole: Role) {
  if (!hasSupabaseEnv()) {
    return null
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const membership = await getCurrentMembership(supabase as any, user.id)
  if (!membership || membership.role !== requiredRole) {
    return null
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", user.id)
    .maybeSingle()

  const viewer: WorkspaceViewer = {
    id: user.id,
    email: profile?.email ?? user.email ?? null,
    name: profile?.full_name ?? user.user_metadata.full_name ?? user.email ?? "Playcall user",
    role: requiredRole,
  }

  return {
    supabase,
    workspaceId: membership.workspaceId,
    viewer,
  }
}

async function fetchWorkspacePlaybooks(supabase: SupabaseClient, workspaceId: string, onlySlug?: string) {
  let playbookQuery = supabase
    .from("playbooks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (onlySlug) {
    playbookQuery = playbookQuery.eq("slug", onlySlug)
  }

  const { data: playbookRows } = await playbookQuery

  if (!playbookRows || playbookRows.length === 0) {
    return []
  }

  const playbookIds = playbookRows.map((row) => row.id)

  const [{ data: categoryRows }, { data: criteriaRows }, { data: sourceRows }, { data: assignmentRows }, { data: callRows }, { data: jobRows }] = await Promise.all([
    supabase.from("playbook_categories").select("*").in("playbook_id", playbookIds).order("position", { ascending: true }),
    supabase.from("playbook_criteria").select("*").in("workspace_id", [workspaceId]).order("position", { ascending: true }),
    supabase.from("playbook_source_documents").select("*").in("playbook_id", playbookIds).order("created_at", { ascending: false }),
    supabase.from("playbook_assignments").select("playbook_id").in("playbook_id", playbookIds),
    supabase.from("calls").select("id, playbook_id").in("playbook_id", playbookIds),
    supabase
      .from("processing_jobs")
      .select("entity_type, entity_id, job_type, status, last_error, created_at, payload")
      .eq("workspace_id", workspaceId)
      .in("entity_type", ["playbook", "playbook_source_document"])
      .order("created_at", { ascending: false }),
  ])

  const criteriaByCategory = new Map<string, string[]>()
  for (const row of criteriaRows ?? []) {
    const current = criteriaByCategory.get(row.playbook_category_id) ?? []
    current.push(row.criterion)
    criteriaByCategory.set(row.playbook_category_id, current)
  }

  const categoriesByPlaybook = new Map<string, PlaybookCategory[]>()
  for (const row of categoryRows ?? []) {
    const current = categoriesByPlaybook.get(row.playbook_id) ?? []
    current.push({
      id: row.id,
      name: row.name,
      weight: Number(row.weight ?? 0),
      criteria: criteriaByCategory.get(row.id) ?? [],
    })
    categoriesByPlaybook.set(row.playbook_id, current)
  }

  const sourcesByPlaybook = new Map<string, PlaybookSourceDocument[]>()
  const sourceErrorByPlaybook = new Map<string, string>()
  const notesByPlaybook = new Map<string, string>()
  for (const row of sourceRows ?? []) {
    const current = sourcesByPlaybook.get(row.playbook_id) ?? []
    if (!sourceErrorByPlaybook.has(row.playbook_id) && typeof row.processing_error === "string" && row.processing_error.trim()) {
      sourceErrorByPlaybook.set(row.playbook_id, row.processing_error.trim())
    }
    if (
      row.source_type === "prompt" &&
      !notesByPlaybook.has(row.playbook_id) &&
      typeof row.pasted_content === "string" &&
      row.pasted_content.trim()
    ) {
      notesByPlaybook.set(row.playbook_id, row.pasted_content.trim())
    }
    current.push({
      id: row.id,
      name: row.name,
      type: row.source_type,
      updatedAt: formatDate(row.updated_at),
      status: row.processing_status === "ready" ? "attached" : row.processing_status === "failed" ? "failed" : "processing",
      error: humanizeProcessingError(typeof row.processing_error === "string" ? row.processing_error : null),
    })
    sourcesByPlaybook.set(row.playbook_id, current)
  }

  const sourceDocToPlaybookId = new Map((sourceRows ?? []).map((row) => [row.id, row.playbook_id]))
  const jobErrorByPlaybook = new Map<string, string>()
  for (const row of jobRows ?? []) {
    if (row.status !== "failed" || typeof row.last_error !== "string" || !row.last_error.trim()) {
      continue
    }

    const playbookId =
      row.entity_type === "playbook"
        ? row.entity_id
        : row.entity_type === "playbook_source_document"
          ? sourceDocToPlaybookId.get(row.entity_id) ?? null
          : null

    if (playbookId && !jobErrorByPlaybook.has(playbookId)) {
      jobErrorByPlaybook.set(playbookId, row.last_error.trim())
    }
  }

  const assignmentCountByPlaybook = new Map<string, number>()
  for (const row of assignmentRows ?? []) {
    assignmentCountByPlaybook.set(row.playbook_id, (assignmentCountByPlaybook.get(row.playbook_id) ?? 0) + 1)
  }

  const callCountByPlaybook = new Map<string, number>()
  const playbookIdByCallId = new Map<string, string>()
  for (const row of callRows ?? []) {
    callCountByPlaybook.set(row.playbook_id, (callCountByPlaybook.get(row.playbook_id) ?? 0) + 1)
    playbookIdByCallId.set(row.id, row.playbook_id)
  }

  const callIds = (callRows ?? []).map((row) => row.id)
  const { data: scoreRows } =
    callIds.length > 0
      ? await supabase.from("call_scores").select("call_id, overall_score").in("call_id", callIds)
      : { data: [] as any[] }

  const scoresByPlaybook = new Map<string, number[]>()
  for (const row of scoreRows ?? []) {
    const playbookId = playbookIdByCallId.get(row.call_id)
    const overallScore = Number(row.overall_score ?? 0)
    if (!playbookId || !Number.isFinite(overallScore) || overallScore <= 0) {
      continue
    }

    const current = scoresByPlaybook.get(playbookId) ?? []
    current.push(overallScore)
    scoresByPlaybook.set(playbookId, current)
  }

  const avgScoreByPlaybook = new Map<string, number>()
  for (const [playbookId, scores] of scoresByPlaybook.entries()) {
    avgScoreByPlaybook.set(playbookId, Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length))
  }

  return playbookRows.map((row): PlaybookRecord => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    notes: notesByPlaybook.get(row.id) ?? "",
    segment: row.target_segment ?? "—",
    callTypes: Array.isArray(row.applicable_call_types) ? row.applicable_call_types : [],
    methodology: row.methodology ?? "Custom",
    status: row.status,
    reps: assignmentCountByPlaybook.get(row.id) ?? 0,
    calls: callCountByPlaybook.get(row.id) ?? 0,
    adherence: avgScoreByPlaybook.get(row.id) ?? 0,
    updated: formatDate(row.updated_at),
    sourceTypes: Array.isArray(row.source_types) ? row.source_types.map((value: string) => value.toUpperCase()) : [],
    sourceDocuments: sourcesByPlaybook.get(row.id) ?? [],
    categories: categoriesByPlaybook.get(row.id) ?? [],
    processingStatus: (row.processing_status ?? "ready") as PlaybookRecord["processingStatus"],
    processingError: humanizeProcessingError(jobErrorByPlaybook.get(row.id) ?? sourceErrorByPlaybook.get(row.id) ?? null),
  }))
}

// Two failure sources: call_artifacts.processing_error (ingestion) and
// processing_jobs.last_error (scoring). Most recent wins — an old ingestion
// error from a resolved retry shouldn't outrank a fresh scoring failure.
async function buildCallFailureReasons(
  supabase: SupabaseClient,
  workspaceId: string,
  failedCallIds: string[]
): Promise<Map<string, string>> {
  if (failedCallIds.length === 0) {
    return new Map()
  }

  const [{ data: artifactRows }, { data: jobRows }] = await Promise.all([
    supabase
      .from("call_artifacts")
      .select("call_id, processing_error, updated_at")
      .in("call_id", failedCallIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("processing_jobs")
      .select("entity_id, last_error, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "call")
      .in("entity_id", failedCallIds)
      .eq("status", "failed")
      .order("updated_at", { ascending: false }),
  ])

  const rawReasonByCallId = new Map<string, { reason: string; updatedAt: string }>()

  const consider = (callId: string, reason: string | null | undefined, updatedAt: string) => {
    if (!reason || !reason.trim()) return
    const existing = rawReasonByCallId.get(callId)
    if (!existing || new Date(updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      rawReasonByCallId.set(callId, { reason: reason.trim(), updatedAt })
    }
  }

  for (const row of artifactRows ?? []) {
    consider(row.call_id, row.processing_error, row.updated_at)
  }
  for (const row of jobRows ?? []) {
    consider(row.entity_id, row.last_error, row.updated_at)
  }

  const result = new Map<string, string>()
  for (const [callId, { reason }] of rawReasonByCallId) {
    const humanized = humanizeProcessingError(reason)
    if (humanized) result.set(callId, humanized)
  }

  return result
}

async function fetchWorkspaceCalls(
  supabase: SupabaseClient,
  workspaceId: string,
  playbookNameById: Map<string, string>,
  repId?: string,
  onlyCallIds?: string[]
) {
  let query = supabase
    .from("calls")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false })

  if (repId) {
    query = query.eq("rep_id", repId)
  }

  if (onlyCallIds) {
    query = query.in("id", onlyCallIds)
  }

  const { data: callRows } = await query

  if (!callRows || callRows.length === 0) {
    return []
  }

  const callIds = callRows.map((row) => row.id)
  const repIds = [...new Set(callRows.map((row) => row.rep_id))]

  const failedCallIds = callRows.filter((row) => row.processing_status === "failed").map((row) => row.id)
  const failureReasonByCallId = await buildCallFailureReasons(supabase, workspaceId, failedCallIds)

  const [{ data: scoreRows }, { data: repRows }] = await Promise.all([
    supabase.from("call_scores").select("*").in("call_id", callIds),
    supabase.from("profiles").select("id, full_name, email").in("id", repIds),
  ])

  const scoreIds = (scoreRows ?? []).map((row) => row.id)
  const [{ data: dimensionRows }, { data: commentRows }] = await Promise.all([
    scoreIds.length > 0
      ? supabase.from("call_score_dimensions").select("*").in("call_score_id", scoreIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("coaching_comments")
      .select("*")
      .in("call_id", callIds)
      .order("created_at", { ascending: true }),
  ])

  const commentAuthorIds = [...new Set((commentRows ?? []).map((row) => row.author_id).filter(Boolean))]
  const { data: commentAuthorRows } =
    commentAuthorIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, email").in("id", commentAuthorIds)
      : { data: [] as any[] }

  const repMap = new Map((repRows ?? []).map((row) => [row.id, row]))
  const commentAuthorMap = new Map((commentAuthorRows ?? []).map((row) => [row.id, row]))
  const scoreByCallId = new Map<string, any>()
  for (const row of scoreRows ?? []) {
    scoreByCallId.set(row.call_id, row)
  }

  const dimensionsByScoreId = new Map<string, ScoreDimension[]>()
  const evidenceByScoreId = new Map<string, Array<{ title: string; quote: string }>>()
  for (const row of dimensionRows ?? []) {
    const current = dimensionsByScoreId.get(row.call_score_id) ?? []
    const dimensionEvidence: Array<{ title: string; quote: string }> = []

    if (Array.isArray(row.transcript_evidence)) {
      for (const item of row.transcript_evidence) {
        if (item && typeof item === "object") {
          dimensionEvidence.push({
            title: typeof item.title === "string" ? item.title : row.category_name,
            quote: typeof item.quote === "string" ? item.quote : "",
          })
        }
      }
    }

    current.push({
      label: row.category_name,
      score: Number(row.score ?? 0),
      outOf: Number(row.out_of ?? 10),
      note: row.summary_note ?? "",
      evidence: dimensionEvidence,
    })
    dimensionsByScoreId.set(row.call_score_id, current)

    const evidenceItems = evidenceByScoreId.get(row.call_score_id) ?? []
    evidenceItems.push(...dimensionEvidence)
    evidenceByScoreId.set(row.call_score_id, evidenceItems)
  }

  const commentsByCallId = new Map<
    string,
    Array<{ id: string; author: string; body: string; createdAt: string }>
  >()
  for (const row of commentRows ?? []) {
    const current = commentsByCallId.get(row.call_id) ?? []
    const author = commentAuthorMap.get(row.author_id)
    current.push({
      id: row.id,
      author: author?.full_name ?? author?.email ?? "Manager",
      body: row.body,
      createdAt: formatDate(row.created_at),
    })
    commentsByCallId.set(row.call_id, current)
  }

  return callRows.map((row): CallRecord => {
    const playbookName = playbookNameById.get(row.playbook_id)
    const score = scoreByCallId.get(row.id)
    const dimensions = score ? dimensionsByScoreId.get(score.id) ?? [] : []
    const evidence = score ? evidenceByScoreId.get(score.id) ?? [] : []
    const rep = repMap.get(row.rep_id)
    const accountContext = normalizeAccountContext(row.buyer_context, row)

    return {
      id: row.id,
      rep: rep?.full_name ?? rep?.email ?? "Unknown rep",
      company: row.company_name,
      playbook: playbookName ?? "Unknown playbook",
      playbookId: row.playbook_id,
      callType: row.call_type,
      dealStageBefore: row.deal_stage_before ?? undefined,
      dealStageAfter: row.deal_stage_after ?? null,
      score: Math.round(Number(score?.overall_score ?? 0)),
      adherence: Math.round(Number(score?.playbook_adherence ?? 0)),
      outcome: row.outcome ? String(row.outcome).replace(/-/g, " ") : "Not logged",
      date: formatDate(row.occurred_at),
      status: row.processing_status,
      processingError: failureReasonByCallId.get(row.id) ?? null,
      pipelineAmount: formatCurrency(row.pipeline_amount),
      lossReason: row.loss_reason ?? null,
      talkListenRatio:
        typeof score?.talk_ratio === "number" && typeof score?.listen_ratio === "number"
          ? `${Math.round(score.talk_ratio)} / ${Math.round(score.listen_ratio)}`
          : null,
      scoreBreakdown: dimensions,
      missedQuestions: Array.isArray(score?.missed_questions) ? score.missed_questions : [],
      missedOpportunities: Array.isArray(score?.missed_opportunities) ? score.missed_opportunities : [],
      productInaccuracies: Array.isArray(score?.product_inaccuracies) ? score.product_inaccuracies : [],
      accountContext,
      transcriptEvidence: evidence,
      bestMoment: score?.best_moment ?? "No best moment captured yet.",
      topMissedMoment: score?.top_missed_moment ?? "No missed moment captured yet.",
      buyerAwareFeedback: score?.buyer_aware_feedback ?? undefined,
      recommendedDrill: score?.recommended_coaching_drill ?? "Coaching drill pending.",
      coachingComments: commentsByCallId.get(row.id) ?? [],
    }
  })
}

function deriveRepAssignments(playbooks: PlaybookRecord[], calls: CallRecord[], members: any[], assignmentRows: any[]) {
  const playbookById = new Map(playbooks.map((playbook) => [playbook.id, playbook.name]))
  const assignmentsByUser = new Map<string, string[]>()

  for (const row of assignmentRows) {
    const current = assignmentsByUser.get(row.user_id) ?? []
    const playbookName = playbookById.get(row.playbook_id)
    if (playbookName) {
      current.push(playbookName)
    }
    assignmentsByUser.set(row.user_id, current)
  }

  return members.map((member): RepAssignment => {
    const relatedCalls = calls.filter((call) => call.rep === (member.profiles?.full_name ?? member.profiles?.email ?? ""))
    const scoredCalls = relatedCalls.filter((call) => Number.isFinite(call.score) && call.score > 0)
    const recentWindowSize = Math.max(1, Math.ceil(scoredCalls.length / 2))
    const recentScores = scoredCalls.slice(0, recentWindowSize)
    const previousScores = scoredCalls.slice(recentWindowSize)
    const avgScore = scoredCalls.length > 0 ? Math.round(scoredCalls.reduce((sum, call) => sum + call.score, 0) / scoredCalls.length) : 0
    const previousScore =
      previousScores.length > 0
        ? Math.round(previousScores.reduce((sum, call) => sum + call.score, 0) / previousScores.length)
        : recentScores.length > 0
          ? Math.round(recentScores.reduce((sum, call) => sum + call.score, 0) / recentScores.length)
          : 0
    const wonCalls = relatedCalls.filter((call) => call.outcome.toLowerCase() === "closed won")
    const winRate = relatedCalls.length > 0 ? `${Math.round((wonCalls.length / relatedCalls.length) * 100)}%` : "0%"

    return {
      id: member.user_id,
      name: member.profiles?.full_name ?? member.profiles?.email ?? "Unknown user",
      email: member.profiles?.email ?? "",
      role: titleizeRole(member.role),
      status: member.status === "active" ? "Active" : "Inactive",
      avgScore,
      previousScore,
      callsAnalyzed: relatedCalls.length,
      winRate,
      playbooks: assignmentsByUser.get(member.user_id) ?? [],
    }
  })
}

async function fetchWorkspaceMembers(supabase: SupabaseClient, workspaceId: string, playbooks: PlaybookRecord[], calls: CallRecord[]) {
  const [{ data: memberRows }, { data: assignmentRows }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("user_id, role, status, profiles(id, email, full_name)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase.from("playbook_assignments").select("user_id, playbook_id").eq("workspace_id", workspaceId),
  ])

  return deriveRepAssignments(playbooks, calls, memberRows ?? [], assignmentRows ?? [])
}

async function fetchPendingInvites(supabase: SupabaseClient, workspaceId: string, playbooks: PlaybookRecord[]) {
  const { data: inviteRows } = await supabase
    .from("pending_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("sent_at", { ascending: false })

  const playbookById = new Map(playbooks.map((playbook) => [playbook.id, playbook.name]))
  const dedupedRows = new Map<string, any>()

  for (const row of inviteRows ?? []) {
    const key = `${row.status}:${String(row.email).toLowerCase()}`
    if (!dedupedRows.has(key)) {
      dedupedRows.set(key, row)
    }
  }

  return Array.from(dedupedRows.values()).map(
    (row): PendingInvite => ({
      id: row.id,
      email: row.email,
      role: normalizeInviteRole(row.role),
      playbooks: Array.isArray(row.playbook_ids)
        ? row.playbook_ids.map((id: string) => playbookById.get(id)).filter(Boolean)
        : [],
      sentAt: formatDate(row.sent_at),
      status: row.status,
    })
  )
}

export async function getLiveRepWorkspaceData(): Promise<RepWorkspaceData> {
  const context = await getLiveViewerContext("rep")

  if (!context) {
    return {
      viewer: null,
      calls: [],
      playbooks: [],
      leaderboard: [],
      currentRep: null,
    }
  }

  const { workspaceId, viewer } = context

  const core = await unstable_cache(
    async () => {
      // Admin client: unstable_cache can't hold cookie-based clients. RLS bypassed;
      // workspace isolation relies on .eq("workspace_id", workspaceId) throughout.
      const admin = createAdminClient()
      const playbooks = await fetchWorkspacePlaybooks(admin, workspaceId)
      const playbookNameById = new Map(playbooks.map((playbook) => [playbook.id, playbook.name]))
      const allCalls = await fetchWorkspaceCalls(admin, workspaceId, playbookNameById)
      const calls = await fetchWorkspaceCalls(admin, workspaceId, playbookNameById, viewer.id)
      const reps = await fetchWorkspaceMembers(admin, workspaceId, playbooks, allCalls)
      const currentRep = reps.find((rep) => rep.id === viewer.id || rep.email === viewer.email) ?? null
      const leaderboard = reps.filter((rep) => rep.role === "Sales Rep").sort((a, b) => b.avgScore - a.avgScore)
      const analytics = buildRepAnalytics(currentRep, calls, leaderboard)
      return {
        calls,
        playbooks: playbooks.filter((playbook) => currentRep?.playbooks.includes(playbook.name)),
        leaderboard,
        currentRep,
        analytics,
      }
    },
    [`rep-workspace`, workspaceId, viewer.id],
    { revalidate: 60, tags: [`workspace-${workspaceId}`] }
  )()

  return { ...core, viewer }
}

export async function getLiveManagerWorkspaceData(): Promise<ManagerWorkspaceData> {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return {
      viewer: null,
      calls: [],
      playbooks: [],
      reps: [],
      invites: [],
    }
  }

  const { workspaceId, viewer } = context

  const core = await unstable_cache(
    async () => {
      // Admin client: unstable_cache can't hold cookie-based clients. RLS bypassed;
      // workspace isolation relies on .eq("workspace_id", workspaceId) throughout.
      const admin = createAdminClient()
      const playbooks = await fetchWorkspacePlaybooks(admin, workspaceId)
      const playbookNameById = new Map(playbooks.map((playbook) => [playbook.id, playbook.name]))
      const calls = await fetchWorkspaceCalls(admin, workspaceId, playbookNameById)
      const reps = await fetchWorkspaceMembers(admin, workspaceId, playbooks, calls)
      const invites = await fetchPendingInvites(admin, workspaceId, playbooks)
      const analytics = buildManagerAnalytics(reps, calls)
      const missingProviderRoles = await getMissingRequiredProviderRoles(workspaceId)
      return { calls, playbooks, reps, invites, analytics, missingProviderRoles }
    },
    [`manager-workspace`, workspaceId],
    { revalidate: 60, tags: [`workspace-${workspaceId}`] }
  )()

  return { ...core, viewer }
}

export async function getLiveCallById(callId: string, role: "rep" | "manager"): Promise<CallRecord | null> {
  const context = await getLiveViewerContext(role)

  if (!context) {
    return null
  }

  const { workspaceId } = context
  const repId = role === "rep" ? context.viewer.id : undefined

  return unstable_cache(
    async () => {
      // Admin client: unstable_cache can't hold cookie-based clients. RLS bypassed;
      // workspace isolation relies on .eq("workspace_id", workspaceId) below.
      const admin = createAdminClient()

      let callQuery = admin
        .from("calls")
        .select("playbook_id")
        .eq("id", callId)
        .eq("workspace_id", workspaceId)

      if (repId) {
        callQuery = callQuery.eq("rep_id", repId)
      }

      const { data: callRow } = await callQuery.maybeSingle()

      if (!callRow) {
        return null
      }

      const { data: playbookRow } = await admin
        .from("playbooks")
        .select("id, name")
        .eq("id", callRow.playbook_id)
        .maybeSingle()

      const playbookNameById = new Map(playbookRow ? [[playbookRow.id, playbookRow.name]] : [])
      const calls = await fetchWorkspaceCalls(admin, workspaceId, playbookNameById, repId, [callId])

      return calls[0] ?? null
    },
    [`call`, callId, workspaceId, repId ?? "manager"],
    { revalidate: 15, tags: [`workspace-${workspaceId}`, `call-${callId}`] }
  )()
}

export async function getLivePlaybookBySlug(slug: string): Promise<PlaybookRecord | null> {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return null
  }

  const { workspaceId } = context

  return unstable_cache(
    async () => {
      // Admin client: unstable_cache can't hold cookie-based clients. RLS bypassed;
      // workspace isolation relies on .eq("workspace_id", workspaceId) in fetchWorkspacePlaybooks.
      const admin = createAdminClient()
      const playbooks = await fetchWorkspacePlaybooks(admin, workspaceId, slug)
      return playbooks[0] ?? null
    },
    [`playbook`, workspaceId, slug],
    { revalidate: 60, tags: [`workspace-${workspaceId}`] }
  )()
}
