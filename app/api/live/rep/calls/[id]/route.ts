import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { getLiveCallById } from "@/lib/data/live-workspace"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"

function parseAmount(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  const cleaned = Number(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(cleaned) ? cleaned : null
}

// The outcome_status enum stores most values space-separated ("next step
// booked") rather than kebab-case like the UI sends ("next-step-booked");
// "no-show" is the one value that keeps its hyphen.
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const call = await getLiveCallById(id, "rep")

  if (!call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(call)
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getLiveViewerContext("rep")

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const dealStageAfter = typeof body?.dealStageAfter === "string" ? body.dealStageAfter.trim() : null
  const rawOutcome = typeof body?.outcome === "string" ? body.outcome.trim() : ""
  const outcome = rawOutcome ? normalizeOutcomeStatus(rawOutcome) : null
  const pipelineAmount = parseAmount(body?.pipelineAmount)
  const lossReason = typeof body?.lossReason === "string" ? body.lossReason.trim() || null : null

  const admin = createAdminClient()
  const { data: updatedCall, error } = await admin
    .from("calls")
    .update({
      deal_stage_after: dealStageAfter,
      outcome,
      pipeline_amount: pipelineAmount,
      loss_reason: rawOutcome === "closed-lost" ? lossReason : null,
    })
    .eq("id", id)
    .eq("workspace_id", viewer.workspaceId)
    .eq("rep_id", viewer.viewer.id)
    .select("id")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!updatedCall) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 })
  }

  revalidateTag(`workspace-${viewer.workspaceId}`, "max")
  revalidateTag(`call-${id}`, "max")
  return NextResponse.json({ ok: true })
}
