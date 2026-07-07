"use client"

import Link from "next/link"
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { RepDashboardLayout } from "@/components/dashboard/rep-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDashboard } from "@/context/dashboard-context"
import { capitalizeFirst, cn } from "@/lib/utils"
import type { CallRecord } from "@/lib/playcall-data"

const processingSteps = [
  "Uploading call file",
  "Reviewing the transcript",
  "Enriching company and primary contact",
  "Generating scorecard and coaching feedback",
]

function getScoreTone(percent: number) {
  if (percent >= 80) {
    return {
      value: "text-lime",
      track: "bg-lime",
      soft: "bg-lime/10 border-lime/20",
      badge: "bg-lime/10 text-lime border-lime/20",
    }
  }

  if (percent >= 50) {
    return {
      value: "text-amber-400",
      track: "bg-amber-400",
      soft: "bg-amber-400/10 border-amber-400/20",
      badge: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    }
  }

    return {
      value: "text-rose-400",
      track: "bg-rose-400",
      soft: "bg-rose-400/10 border-rose-400/20",
      badge: "bg-rose-400/10 text-rose-300 border-rose-400/20",
  }
}

function formatTalkListenRatio(ratio: string | null) {
  if (!ratio) return null

  const [talk, listen] = ratio.split("/").map((part) => part.trim())
  if (!talk || !listen) return null

  return { talk, listen }
}

function getProcessingStage(call: {
  status: string
  score: number
  scoreBreakdown: Array<unknown>
  accountContext: {
    confidence: {
      company: number
      contact: number
      stage: number
      salesMotion: number
    }
    sources: {
      company: string[]
      contact: string[]
    }
  }
}) {
  if (call.status === "ready" || call.score > 0 || call.scoreBreakdown.length > 0) {
    return processingSteps.length
  }

  if (call.status === "failed") {
    return 0
  }

  const hasEnrichment =
    call.accountContext.confidence.company > 0 ||
    call.accountContext.confidence.contact > 0 ||
    call.accountContext.confidence.stage > 0 ||
    call.accountContext.confidence.salesMotion > 0 ||
    call.accountContext.sources.company.length > 0 ||
    call.accountContext.sources.contact.length > 0

  if (hasEnrichment) {
    return 3
  }

  if (call.status === "processing") {
    return 2
  }

  return 1
}

interface RepCallDetailClientProps {
  initialCall: CallRecord | null
  isDemoMode: boolean
}

function RepCallAnalysisPageInner({ initialCall, isDemoMode }: RepCallDetailClientProps) {
  const { addNotification } = useDashboard()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const call = initialCall
  const shouldProcess = searchParams.get("processing") === "1"
  const [isSavingOutcome, setIsSavingOutcome] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [outcomeForm, setOutcomeForm] = useState({
    dealStageAfter: call?.dealStageAfter ?? "solution-aware",
    outcome: call?.dealStageAfter ? call.outcome.toLowerCase().replaceAll(" ", "-") : "next-step-booked",
    pipelineAmount: call?.pipelineAmount ?? "",
    lossReason: call?.lossReason ?? "",
  })

  const hasScoreData = (call?.score ?? 0) > 0 || (call?.scoreBreakdown?.length ?? 0) > 0

  const [confirmedFailed, setConfirmedFailed] = useState(false)
  const failedSightingsRef = useRef(0)

  useEffect(() => {
    if (call?.status === "failed") {
      failedSightingsRef.current += 1
      if (failedSightingsRef.current >= 2) {
        setConfirmedFailed(true)
      }
    } else {
      failedSightingsRef.current = 0
      setConfirmedFailed(false)
    }
  }, [call?.status])

  const isProcessing =
    !isDemoMode &&
    call != null &&
    (call.status === "queued" ||
      call.status === "processing" ||
      (call.status === "ready" && !hasScoreData) ||
      (call.status === "failed" && !confirmedFailed))
  const isFailed = !isDemoMode && confirmedFailed

  useEffect(() => {
    if (!call) return
    setOutcomeForm({
      dealStageAfter: call.dealStageAfter ?? "solution-aware",
      outcome: call.dealStageAfter ? call.outcome.toLowerCase().replaceAll(" ", "-") : "next-step-booked",
      pipelineAmount: call.pipelineAmount ?? "",
      lossReason: call.lossReason ?? "",
    })
  }, [call?.dealStageAfter, call?.lossReason, call?.outcome, call?.pipelineAmount])

  useEffect(() => {
    if (isDemoMode || !isProcessing) {
      if (!isDemoMode && call?.status === "ready" && shouldProcess) {
        router.replace(`/rep/calls/${params.id}`)
      }
      return
    }

    const interval = window.setInterval(() => {
      router.refresh()
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [call?.status, isDemoMode, isProcessing, params.id, router, shouldProcess])

  const overallBreakdown = useMemo(
    () =>
      (call?.scoreBreakdown ?? []).map((item) => ({
        ...item,
        percent: Math.round((item.score / item.outOf) * 100),
      })),
    [call?.scoreBreakdown]
  )

  if (!call) {
    notFound()
    return null
  }

  const processingStage = getProcessingStage(call)
  const scorePillars = overallBreakdown.slice(0, 5)
  const breakdownWithEvidence = overallBreakdown.map((item) => ({
    ...item,
    evidence: item.evidence?.[0] ?? null,
    tone: getScoreTone(Math.round((item.score / item.outOf) * 100)),
  }))
  const overallTone = getScoreTone(call.score)
  const adherenceTone = getScoreTone(call.adherence)
  const talkListen = formatTalkListenRatio(call.talkListenRatio ?? null)

  const outcomeBaseline = {
    dealStageAfter: call.dealStageAfter ?? "solution-aware",
    outcome: call.dealStageAfter ? call.outcome.toLowerCase().replaceAll(" ", "-") : "next-step-booked",
    pipelineAmount: call.pipelineAmount ?? "",
    lossReason: call.lossReason ?? "",
  }
  const hasOutcomeChanges =
    outcomeForm.dealStageAfter !== outcomeBaseline.dealStageAfter ||
    outcomeForm.outcome !== outcomeBaseline.outcome ||
    outcomeForm.pipelineAmount !== outcomeBaseline.pipelineAmount ||
    outcomeForm.lossReason !== outcomeBaseline.lossReason

  const saveOutcomeUpdates = async () => {
    if (isDemoMode) {
      addNotification({
        title: "Outcome saved",
        message: "Deal stage, outcome, and pipeline updates were saved.",
        type: "success",
      })
      return
    }

    try {
      setIsSavingOutcome(true)
      const response = await fetch(`/api/live/rep/calls/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dealStageAfter: outcomeForm.dealStageAfter,
          outcome: outcomeForm.outcome,
          pipelineAmount: outcomeForm.pipelineAmount,
          lossReason: outcomeForm.lossReason,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save outcome")
      }

      router.refresh()
      addNotification({
        title: "Outcome saved",
        message: "Deal stage, outcome, and pipeline updates were saved.",
        type: "success",
      })
    } catch (error) {
      addNotification({
        title: "Unable to save outcome",
        message: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      })
    } finally {
      setIsSavingOutcome(false)
    }
  }

  const handleRetryProcessing = async () => {
    if (isDemoMode) {
      addNotification({
        title: "Retry queued",
        message: "Live retries aren't available in demo mode.",
        type: "success",
      })
      return
    }

    try {
      setIsRetrying(true)
      const response = await fetch(`/api/live/rep/calls/${params.id}/retry`, { method: "POST" })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to retry call")
      }

      router.refresh()
      addNotification({
        title: "Retry started",
        message: "We're reprocessing this call now.",
        type: "success",
      })
    } catch (error) {
      addNotification({
        title: "Unable to retry call",
        message: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      })
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-10 font-sans">
      <div className="mx-auto max-w-7xl">
        <div className="group relative mb-8 flex flex-col gap-6 overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-8 shadow-sm backdrop-blur-xl transition-all hover:bg-card/50 lg:flex-row lg:items-end lg:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-lime/5 via-transparent to-transparent opacity-50" />
          <div className="relative max-w-3xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
              <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">Scorecard</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              <span className="text-foreground">{call.company}</span>
              <span className="font-light text-muted-foreground"> · {call.playbook}</span>
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-lime/80 shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                <span className="font-medium text-foreground/80">{capitalizeFirst(call.callType)}</span>
              </div>
              <span className="text-border">•</span>
              <span>{call.date}</span>
              <span className="text-border">•</span>
              <span>
                Deal stage before: <span className="font-medium text-foreground/80">{call.dealStageBefore}</span>
              </span>
            </div>
          </div>
          <div className="relative flex gap-3">
            <Link href="/rep/calls">
              <Button variant="outline" className="border-border/50 bg-background/40 backdrop-blur-sm transition-colors hover:bg-background/80">
                Back to My Calls
              </Button>
            </Link>
            <Link href="/rep/upload">
              <Button className="bg-lime text-background shadow-[0_0_20px_rgba(163,230,53,0.2)] transition-all hover:bg-lime/90 hover:shadow-[0_0_25px_rgba(163,230,53,0.3)]">
                Upload Another Call
              </Button>
            </Link>
          </div>
        </div>

        {isProcessing && call?.status !== "failed" ? (
          <div className="mb-8 overflow-hidden rounded-2xl border border-lime/20 bg-lime/5 p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 animate-pulse rounded-full bg-lime" />
              <p className="text-base font-medium text-foreground">Building your feedback</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Stay on this page. The full analysis will appear here as soon as scoring completes.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {processingSteps.map((label, index) => {
                const done = processingStage > index + 1
                const active = processingStage === index + 1

                return (
                  <div
                    key={label}
                    className={cn(
                      "relative flex flex-col justify-between gap-3 rounded-xl border p-4 transition-all duration-500",
                      done ? "border-lime/30 bg-lime/10" : active ? "border-lime/50 bg-background/80 shadow-[0_0_15px_rgba(163,230,53,0.1)]" : "border-border/40 bg-surface/30 opacity-60"
                    )}
                  >
                    <span className={cn("text-sm font-medium", done || active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                    <span className={cn("text-[10px] font-mono uppercase tracking-[0.18em]", done ? "text-lime" : active ? "text-foreground/70 animate-pulse" : "text-muted-foreground/60")}>
                      {done ? "Done" : active ? "Working" : "Pending"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {isFailed ? (
          <div className="mb-8 overflow-hidden rounded-2xl border border-rose-400/20 bg-rose-400/10 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-rose-400" />
                <p className="text-base font-medium text-foreground">Call processing failed</p>
              </div>
              <Button
                onClick={handleRetryProcessing}
                disabled={isRetrying}
                variant="outline"
                className="border-rose-400/30 bg-background/40 text-rose-200 hover:bg-rose-400/10"
              >
                {isRetrying ? "Retrying..." : "Retry processing"}
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {call.processingError ??
                "Live scoring did not complete for this call. Try retrying, or check workspace provider settings if it keeps failing."}
            </p>
          </div>
        ) : null}

        <div className={cn("flex flex-col gap-6 transition-all duration-500", isProcessing ? "pointer-events-none opacity-30 blur-[2px]" : "")}>
          {/* Top Hook: Full Width Scoreboard */}
          <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl shadow-sm">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Overall score</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className={cn("text-6xl font-mono", overallTone.value)}>{call.score}</span>
                  <span className="pb-2 text-sm text-muted-foreground">/100</span>
                </div>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  Playcall scores whether your messaging was perfectly tailored for this buyer, company, and deal stage.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/40 bg-surface/30 p-5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Playbook adherence</p>
                  <p className={cn("mt-2 text-3xl font-light tracking-tight", adherenceTone.value)}>{call.adherence}%</p>
                </div>
                <div className="rounded-2xl border border-border/40 bg-surface/30 p-5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Talk / listen</p>
                  {talkListen ? (
                    <div className="mt-2 flex items-baseline gap-3 text-sm">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-medium text-foreground/90">{talkListen.talk}%</span>
                        <span className="text-xs text-muted-foreground">talk</span>
                      </div>
                      <div className="h-4 w-px bg-border/60" />
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-medium text-foreground/90">{talkListen.listen}%</span>
                        <span className="text-xs text-muted-foreground">listen</span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xl font-medium text-muted-foreground">N/A</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {scorePillars.map((item) => {
                const percent = Math.round((item.score / item.outOf) * 100)
                const tone = getScoreTone(percent)
                return (
                  <div
                    key={item.label}
                    className={cn(
                      "flex flex-col justify-between rounded-2xl border p-4 transition-colors",
                      tone.soft
                    )}
                  >
                    <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground line-clamp-1" title={item.label}>{item.label}</p>
                    <p className={cn("mt-4 text-xl font-medium", tone.value)}>
                      {item.score}<span className="text-xs opacity-60">/{item.outOf}</span>
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Two Column Layout: Evidence vs Action */}
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] items-start">

            {/* Left Column: Evidence & Context */}
            <div className="flex flex-col gap-6">

              {/* Buyer-aware summary */}
              <div className="flex flex-col rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-lime/20 bg-lime/10 text-lime">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight">Buyer-aware summary</h2>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {call.buyerAwareFeedback ?? "Buyer-aware analysis pending."}
                </p>
                <div className="mt-auto pt-6 grid gap-4 sm:grid-cols-2">
                  <div className="group relative overflow-hidden rounded-2xl border border-lime/20 bg-lime/5 p-5 transition-all hover:bg-lime/10">
                    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-lime/10 blur-2xl transition-all group-hover:bg-lime/20" />
                    <div className="relative">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-lime">Best moment</p>
                      <p className="mt-3 text-sm leading-relaxed text-foreground/90">{call.bestMoment}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-surface/30 p-5 transition-all hover:bg-surface/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top missed moment</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{call.topMissedMoment}</p>
                  </div>
                </div>
              </div>

              {/* Transcript Category Breakdown */}
              <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                <h2 className="text-xl font-semibold tracking-tight">Category breakdown</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Detailed scoring with transcript evidence for each pillar.
                </p>
                <div className="mt-8 space-y-5">
                  {breakdownWithEvidence.map((item) => (
                    <div key={item.label} className="group rounded-2xl border border-border/40 bg-surface/20 p-5 transition-all hover:bg-surface/40 hover:border-border/60">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="pr-6">
                          <p className="text-base font-medium text-foreground/90">{item.label}</p>
                          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.note}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end sm:min-w-[88px]">
                          <div className="flex items-baseline gap-1">
                            <p className={cn("text-2xl font-semibold tracking-tight", item.tone.value)}>{item.score}</p>
                            <p className="text-sm font-medium text-muted-foreground">/{item.outOf}</p>
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{item.percent}%</p>
                        </div>
                      </div>
                      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-background/50">
                        <div className={cn("h-full rounded-full transition-all duration-1000", item.tone.track)} style={{ width: `${item.percent}%` }} />
                      </div>
                      {item.evidence ? (
                        <div className="relative mt-5 overflow-hidden rounded-xl border border-border/30 bg-background/30 p-4 transition-colors group-hover:border-border/50 group-hover:bg-background/50">
                          <div className="absolute left-0 top-0 h-full w-1 bg-border/40" />
                          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                            Transcript evidence
                          </p>
                          <p className="mt-2.5 text-sm italic leading-relaxed text-muted-foreground">"{item.evidence.quote}"</p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Action & Feedback (Sticky) */}
            <div className="sticky top-6 flex flex-col gap-6">

              {/* Recommended coaching drill */}
              <div className="relative overflow-hidden rounded-3xl border border-lime/30 bg-card/80 p-8 shadow-[0_8px_30px_rgba(163,230,53,0.12)] backdrop-blur-xl">
                <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-lime/10 blur-3xl pointer-events-none" />
                <div className="relative">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">Recommended coaching drill</h2>
                  <p className="mt-4 text-sm leading-relaxed text-foreground/80">{call.recommendedDrill}</p>
                </div>
              </div>

              {/* What to improve next */}
              {(call.missedQuestions.length > 0 || call.missedOpportunities.length > 0 || call.productInaccuracies.length > 0) && (
                <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                  <h2 className="text-lg font-semibold tracking-tight">What to improve next</h2>
                  <div className="mt-5 grid gap-3">
                    {call.missedQuestions.length > 0 && (
                      <div className="rounded-xl border border-border/30 bg-surface/30 p-4 hover:bg-surface/50 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <p className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Missed questions</p>
                        </div>
                        <div className="space-y-2">
                          {call.missedQuestions.map((item) => (
                            <p key={item} className="text-sm text-muted-foreground leading-relaxed">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {call.missedOpportunities.length > 0 && (
                      <div className="rounded-xl border border-border/30 bg-surface/30 p-4 hover:bg-surface/50 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                          <p className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Missed opportunities</p>
                        </div>
                        <div className="space-y-2">
                          {call.missedOpportunities.map((item) => (
                            <p key={item} className="text-sm text-muted-foreground leading-relaxed">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {call.productInaccuracies.length > 0 && (
                      <div className="rounded-xl border border-border/30 bg-surface/30 p-4 hover:bg-surface/50 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <p className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Product inaccuracies</p>
                        </div>
                        <div className="space-y-2">
                          {call.productInaccuracies.map((item) => (
                            <p key={item} className="text-sm text-muted-foreground leading-relaxed">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Manager Feedback */}
              {call.coachingComments && call.coachingComments.length > 0 ? (
                <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                  <h2 className="text-lg font-semibold tracking-tight">Your manager's feedback</h2>
                  <div className="mt-5 space-y-4">
                    {call.coachingComments.map((comment) => (
                      <div key={comment.id} className="rounded-2xl border border-border/30 bg-surface/30 p-5">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-medium text-foreground/90">{comment.author}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{comment.createdAt}</p>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Outcome Tracking Form */}
              <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                <h2 className="text-lg font-semibold tracking-tight">Outcome tracking</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Update what happened after the call.
                </p>
                <div className="mt-6 space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-2.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Deal Stage After</label>
                      <select
                        value={outcomeForm.dealStageAfter ?? ""}
                        onChange={(e) => {
                          setOutcomeForm((prev) => ({ ...prev, dealStageAfter: e.target.value }))
                        }}
                        className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                      >
                        <option value="problem-aware">Problem-aware</option>
                        <option value="solution-aware">Solution-aware</option>
                        <option value="vendor-evaluating">Vendor evaluating</option>
                        <option value="committed">Committed</option>
                        <option value="closed-lost">Closed lost</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outcome</label>
                      <select
                        value={outcomeForm.outcome}
                        onChange={(e) => {
                          setOutcomeForm((prev) => ({ ...prev, outcome: e.target.value }))
                        }}
                        className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                      >
                        <option value="no-show">No-show</option>
                        <option value="next-step-booked">Next step booked</option>
                        <option value="moved-stage">Moved stage</option>
                        <option value="no-advancement">No advancement</option>
                        <option value="closed-won">Closed won</option>
                        <option value="closed-lost">Closed lost</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Updated ARR (Optional)</label>
                    <Input
                      value={outcomeForm.pipelineAmount}
                      onChange={(e) => {
                        setOutcomeForm((prev) => ({ ...prev, pipelineAmount: e.target.value }))
                      }}
                      className="rounded-xl border-border/50 bg-background/50 px-4 py-5 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                      placeholder="$25,000"
                    />
                  </div>
                  {outcomeForm.outcome === "closed-lost" ? (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="mb-2.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Loss Reason</label>
                      <textarea
                        value={outcomeForm.lossReason}
                        onChange={(e) => {
                          setOutcomeForm((prev) => ({ ...prev, lossReason: e.target.value }))
                        }}
                        className="h-28 w-full resize-none rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                        placeholder="What caused the loss?"
                      />
                    </div>
                  ) : null}
                  <Button
                    onClick={saveOutcomeUpdates}
                    disabled={isSavingOutcome || !hasOutcomeChanges}
                    className="mt-2 w-full rounded-xl bg-lime py-6 text-sm font-semibold text-lime-950 shadow-[0_4px_14px_0_rgba(163,230,53,0.39)] transition-all hover:-translate-y-[1px] hover:bg-lime/90 hover:shadow-[0_6px_20px_rgba(163,230,53,0.23)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_14px_0_rgba(163,230,53,0.39)]"
                  >
                    {isSavingOutcome ? "Saving outcome..." : "Save outcome updates"}
                  </Button>
                </div>
              </div>

              {/* Buyer context used */}
              <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Buyer context used</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The context that dynamically shaped this scorecard.
                  </p>
                </div>
                <div className="mt-5 grid gap-3">
                  <div className="rounded-xl border border-border/30 bg-surface/30 p-4">
                    <p className="font-medium text-foreground/90">{call.accountContext.company.name}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.company.domain}</span>
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.company.stage}</span>
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.company.employeeBand}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.company.salesMotion}</span>
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.company.pricingModel}</span>
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.company.buyingStageHypothesis}</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/30 bg-surface/30 p-4">
                    <p className="font-medium text-foreground/90">{call.accountContext.contact.name}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.contact.title}</span>
                      <span className="rounded-md bg-background/50 px-2 py-1 border border-border/50">{call.accountContext.contact.likelyRoleInPurchase}</span>
                    </div>
                    <p className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                      <span>Company conf: <span className="font-medium text-foreground/70">{Math.round(call.accountContext.confidence.company * 100)}%</span></span>
                      <span className="h-1 w-1 rounded-full bg-border" />
                      <span>Contact conf: <span className="font-medium text-foreground/70">{Math.round(call.accountContext.confidence.contact * 100)}%</span></span>
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RepCallDetailClient({ initialCall, isDemoMode }: RepCallDetailClientProps) {
  return (
    <RepDashboardLayout>
      <RepCallAnalysisPageInner initialCall={initialCall} isDemoMode={isDemoMode} />
    </RepDashboardLayout>
  )
}
