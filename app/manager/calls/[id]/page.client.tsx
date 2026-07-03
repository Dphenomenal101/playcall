"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { capitalizeFirst, cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import type { CallRecord } from "@/lib/playcall-data"

function getScoreTone(percent: number) {
  if (percent >= 80) {
    return {
      value: "text-lime",
      track: "bg-lime",
      soft: "bg-lime/10 border-lime/20",
    }
  }

  if (percent >= 50) {
    return {
      value: "text-amber-400",
      track: "bg-amber-400",
      soft: "bg-amber-400/10 border-amber-400/20",
    }
  }

  return {
    value: "text-rose-400",
    track: "bg-rose-400",
    soft: "bg-rose-400/10 border-rose-400/20",
  }
}

function formatTalkListenRatio(ratio: string | null) {
  if (!ratio) return null

  const [talk, listen] = ratio.split("/").map((part) => part.trim())
  if (!talk || !listen) return null

  return { talk, listen }
}

function CallDetailPageInner({ initialCall, isDemoMode }: { initialCall: CallRecord | null; isDemoMode: boolean }) {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [call, setCall] = useState(initialCall)
  const [comment, setComment] = useState("")
  const [isSavingComment, setIsSavingComment] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  // calls.processing_status flips to "ready" as soon as source artifacts
  // finish ingesting, which happens before buyer enrichment and scoring even
  // start (those can take 20-60+ seconds afterward). Treat "ready" with no
  // score data yet as still-processing so polling doesn't stop and render a
  // permanently empty scorecard before scoring has actually attached.
  const hasScoreData = (call?.score ?? 0) > 0 || (call?.scoreBreakdown?.length ?? 0) > 0

  // Job dispatch falls back from the Edge Function to local in-process
  // processing on any error (lib/jobs/dispatch.ts) - the Edge Function
  // attempt writes processing_status "failed" before the local fallback
  // even starts retrying, so a poll can catch that intermediate write even
  // though the job goes on to succeed moments later. Require a few
  // consecutive "failed" sightings (not just one) before treating it as
  // terminal, so a transient failed-then-recovered window doesn't show a
  // false failure screen.
  const [confirmedFailed, setConfirmedFailed] = useState(false)
  const failedSightingsRef = useRef(0)

  useEffect(() => {
    if (call?.status === "failed") {
      failedSightingsRef.current += 1
      if (failedSightingsRef.current >= 1) {
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
    if (isDemoMode || !isProcessing) {
      return
    }

    const interval = window.setInterval(() => {
      router.refresh()
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [isDemoMode, isProcessing, router])

  if (!call) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-3.5rem)] lg:min-h-screen flex-col items-center justify-center p-6 lg:p-0 lg:pr-64">
          <div className="relative flex flex-col items-center">
            {/* Outer glowing rings */}
            <div className="absolute inset-0 -m-8 animate-[spin_4s_linear_infinite] rounded-full border border-dashed border-lime/20" />
            <div className="absolute inset-0 -m-4 animate-[spin_3s_linear_infinite_reverse] rounded-full border border-lime/10" />

            {/* Core pulsing icon */}
            <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-lime/30 bg-lime/10 shadow-[0_0_30px_rgba(163,230,53,0.2)] backdrop-blur-xl">
              <div className="h-4 w-4 animate-ping rounded-full bg-lime/80" />
              <div className="absolute h-2 w-2 rounded-full bg-lime" />
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center text-center">
            <h2 className="text-lg font-semibold tracking-tight text-foreground/90">Retrieving call scorecard</h2>
            <p className="mt-2 text-sm text-muted-foreground">Fetching transcript, context, and analysis...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const overallTone = getScoreTone(call.score)
  const adherenceTone = getScoreTone(call.adherence)
  const talkListen = formatTalkListenRatio(call.talkListenRatio ?? null)
  const breakdownWithEvidence = (call.scoreBreakdown ?? []).map((item) => {
    const percent = Math.round((item.score / item.outOf) * 100)

    return {
      ...item,
      percent,
      tone: getScoreTone(percent),
      evidence: item.evidence?.[0] ?? null,
    }
  })
  const scorePillars = breakdownWithEvidence.slice(0, 5)

  const saveComment = async () => {
    const trimmed = comment.trim()

    if (!trimmed) {
      toast({
        title: "Comment required",
        description: "Add coaching guidance before saving.",
        variant: "destructive",
      })
      return
    }

    if (isDemoMode) {
      setComment("")
      toast({
        title: "Comment saved",
        description: "Coaching note added to this call.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
      return
    }

    try {
      setIsSavingComment(true)
      const response = await fetch(`/api/live/manager/calls/${params.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment: trimmed }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save comment")
      }

      setComment("")
      router.refresh()
      toast({
        title: "Comment saved",
        description: "Coaching note added to this call.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
    } catch (error) {
      toast({
        title: "Unable to save comment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSavingComment(false)
    }
  }

  const handleRetryProcessing = async () => {
    if (isDemoMode) {
      toast({
        title: "Retry queued",
        description: "Live retries aren't available in demo mode.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
      return
    }

    try {
      setIsRetrying(true)
      const response = await fetch(`/api/live/manager/calls/${params.id}/retry`, { method: "POST" })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to retry call")
      }

      router.refresh()
      toast({
        title: "Retry started",
        description: "We're reprocessing this call now.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
    } catch (error) {
      toast({
        title: "Unable to retry call",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center gap-4">
            <Link href="/manager/calls">
              <Button variant="outline" className="group h-9 rounded-full border-border/50 bg-background/40 px-4 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/80 hover:text-foreground shadow-sm">
                <span className="mr-1.5 transition-transform group-hover:-translate-x-0.5">←</span> Back to Team Calls
              </Button>
            </Link>
          </div>
          <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/95 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.22)] lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Call Review</p>
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{call.rep} · {call.company}</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {call.playbook} · {capitalizeFirst(call.callType)} · {call.date}
              </p>
            </div>
          </div>

          {isProcessing ? (
            <div className="mb-6 rounded-2xl border border-lime/20 bg-lime/5 p-5">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 animate-pulse rounded-full bg-lime" />
                <p className="text-base font-medium text-foreground">Scoring in progress</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                This call is still being transcribed, enriched, and scored. The scorecard below will populate automatically once it's ready.
              </p>
            </div>
          ) : null}

          {isFailed ? (
            <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5">
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
                {call?.processingError ??
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
                    Review whether the rep said the right things for this buyer, at this company, at this stage of the deal.
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
                {scorePillars.map((item) => (
                  <div
                    key={item.label}
                    className={cn("flex flex-col justify-between rounded-2xl border p-4 transition-colors", item.tone.soft)}
                  >
                    <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground line-clamp-1" title={item.label}>{item.label}</p>
                    <p className={cn("mt-4 text-xl font-medium", item.tone.value)}>
                      {item.score}<span className="text-xs opacity-60">/{item.outOf}</span>
                    </p>
                  </div>
                ))}
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

                {/* Deal Progress / Outcome */}
                <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/20 bg-blue-400/10 text-blue-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">Deal progress</h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-border/30 bg-surface/30 p-4 transition-all hover:bg-surface/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage before</p>
                      <p className="mt-2 text-sm font-medium text-foreground/90">{call.dealStageBefore ? capitalizeFirst(call.dealStageBefore) : "Not logged"}</p>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-surface/30 p-4 transition-all hover:bg-surface/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage after</p>
                      <p className="mt-2 text-sm font-medium text-foreground/90">{call.dealStageAfter ? capitalizeFirst(call.dealStageAfter) : "Not logged"}</p>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-surface/30 p-4 transition-all hover:bg-surface/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outcome</p>
                      <p className="mt-2 text-sm font-medium text-foreground/90">{call.outcome ? capitalizeFirst(call.outcome) : "Not logged"}</p>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-surface/30 p-4 transition-all hover:bg-surface/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Amount</p>
                      <p className="mt-2 text-sm font-medium text-foreground/90">{call.pipelineAmount ?? "Not logged"}</p>
                    </div>
                  </div>
                  {call.lossReason ? (
                    <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/80">Loss reason</p>
                      <p className="mt-2 text-sm font-medium text-foreground/90">{call.lossReason}</p>
                    </div>
                  ) : null}
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

              {/* Right Column: Action & History (Sticky) */}
              <div className="sticky top-6 flex flex-col gap-6">

                {/* Coaching Note Form */}
                <div className="relative overflow-hidden rounded-3xl border border-lime/30 bg-card/80 p-8 shadow-[0_8px_30px_rgba(163,230,53,0.12)] backdrop-blur-xl">
                  <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-lime/10 blur-3xl pointer-events-none" />
                  <div className="relative">
                    <h2 className="text-xl font-semibold tracking-tight">Manager coaching</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Add a coaching note for the rep tied to this reviewed call.
                    </p>
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="What should the rep do differently next time?"
                      className="mt-6 h-32 w-full resize-none rounded-xl border border-border/50 bg-background/80 px-4 py-3 text-sm outline-none transition-all focus:border-lime/50 focus:ring-1 focus:ring-lime/50 focus:bg-background shadow-inner"
                    />
                    <Button
                      onClick={saveComment}
                      disabled={isSavingComment}
                      className="mt-4 w-full rounded-xl bg-lime py-6 text-sm font-semibold text-lime-950 shadow-[0_4px_14px_0_rgba(163,230,53,0.39)] transition-all hover:-translate-y-[1px] hover:bg-lime/90 hover:shadow-[0_6px_20px_rgba(163,230,53,0.23)]"
                    >
                      {isSavingComment ? "Saving comment..." : "Save coaching comment"}
                    </Button>
                  </div>
                </div>

                {/* Saved Comments History */}
                <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50">
                  <h2 className="text-lg font-semibold tracking-tight">Previous coaching</h2>
                  <div className="mt-5 space-y-4">
                    {call.coachingComments && call.coachingComments.length > 0 ? (
                      call.coachingComments.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-border/30 bg-surface/30 p-5">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-medium text-foreground/90">{item.author}</p>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.createdAt}</p>
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-border/30 bg-surface/30 p-6 text-center text-sm text-muted-foreground">
                        No coaching comments saved yet.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export function CallDetailPageClient({ initialCall, isDemoMode }: { initialCall: CallRecord | null; isDemoMode: boolean }) {
  return <CallDetailPageInner initialCall={initialCall} isDemoMode={isDemoMode} />
}

export default function CallDetailPage() {
  return <CallDetailPageInner initialCall={null} isDemoMode={true} />
}
