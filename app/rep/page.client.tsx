"use client"

import Link from "next/link"
import { ArrowDownRight, ArrowRight, ArrowUpRight, PhoneCall, Trophy } from "lucide-react"
import { RepDashboardLayout } from "@/components/dashboard/rep-dashboard-layout"
import { GlanceCard } from "@/components/dashboard/glance-card"
import { Button } from "@/components/ui/button"
import { capitalizeFirst } from "@/lib/utils"
import type { RepWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoRepWorkspaceData } from "@/lib/data/demo-workspace"

export function RepDashboardClient({ initialData }: { initialData: RepWorkspaceData; isDemoMode: boolean }) {
  const { isDemoMode } = useDemo()
  const { data } = useDemoLiveResource({
    demoData: getDemoRepWorkspaceData(),
    liveUrl: "/api/live/rep",
    emptyData: initialData,
  })
  const analytics = data.analytics
  const currentRep = data.currentRep
  const recentScores = data.calls.slice(0, 3)
  const callsThisWeek = isDemoMode ? 6 : analytics?.callsSubmitted ?? data.calls.length
  const closedWonRate = isDemoMode ? 33 : analytics?.closedWonRate ?? 0
  const strongestSkill = isDemoMode
    ? { label: "Discovery", score: 9, outOf: 10, detail: "Best when buyers are already problem-aware.", sourceCallId: undefined as string | undefined, sourceCallLabel: undefined as string | undefined }
    : analytics?.strongestSkill
      ? {
          label: analytics.strongestSkill.label,
          score: Math.round(analytics.strongestSkill.score / 10),
          outOf: 10,
          detail: analytics.strongestSkill.detail,
          sourceCallId: analytics.strongestSkill.sourceCallId,
          sourceCallLabel: analytics.strongestSkill.sourceCallLabel,
        }
      : null
  const weakestSkill = isDemoMode
    ? { label: "Next-Step Clarity", score: 8, outOf: 10, detail: "Concrete owner and date still slip late in calls.", sourceCallId: undefined as string | undefined, sourceCallLabel: undefined as string | undefined }
    : analytics?.weakestSkill
      ? {
          label: analytics.weakestSkill.label,
          score: Math.round(analytics.weakestSkill.score / 10),
          outOf: 10,
          detail: analytics.weakestSkill.detail,
          sourceCallId: analytics.weakestSkill.sourceCallId,
          sourceCallLabel: analytics.weakestSkill.sourceCallLabel,
        }
      : null
  const scoreTrend = isDemoMode ? [
    { day: "Mon", score: 86 },
    { day: "Tue", score: 88 },
    { day: "Wed", score: 91 },
    { day: "Thu", score: 89 },
    { day: "Fri", score: 92 },
  ] : (analytics?.scoreTrend ?? []).map((point) => ({
    day: point.day,
    score: point.score,
  }))
  const scoreTrendWithDelta = scoreTrend.map((item, index) => {
    const previous = scoreTrend[index - 1]?.score ?? item.score
    return {
      ...item,
      delta: index === 0 ? 0 : item.score - previous,
    }
  })
  const playbookAdherenceValue = recentScores.length > 0
    ? isDemoMode
      ? Math.round(recentScores.reduce((sum, call) => sum + call.adherence, 0) / recentScores.length)
      : analytics?.playbookAdherenceRate ?? 0
    : 0
  const playbookAdherence = `${playbookAdherenceValue}%`
  const playbookAdherenceHeadline =
    playbookAdherenceValue >= 85
      ? "Strongly aligned to the approved talk track"
      : playbookAdherenceValue >= 70
        ? "Mostly aligned to the approved talk track"
        : playbookAdherenceValue >= 50
          ? "Loosely following the approved talk track"
          : "Drifting from the approved talk track"
  const playbookAdherenceDetail =
    playbookAdherenceValue >= 85
      ? `Current adherence is ${playbookAdherence}. Keep reinforcing the parts of the playbook that are already working.`
      : playbookAdherenceValue >= 70
        ? `Current adherence is ${playbookAdherence}. Keep using the approved discovery structure and next-step framing.`
        : playbookAdherenceValue >= 50
          ? `Current adherence is ${playbookAdherence}. Revisit the playbook's discovery and next-step framing before your next call.`
          : `Current adherence is ${playbookAdherence}. Several core talk-track elements are being missed - review the playbook before your next call.`
  const mostImprovedCategory = isDemoMode ? "Qualification" : analytics?.mostImprovedCategory?.label ?? null
  const leaderboard = data.leaderboard
  const rank = isDemoMode ? (currentRep ? leaderboard.findIndex((rep) => rep.id === currentRep.id) + 1 : 0) : analytics?.leaderboardRank ?? 0

  const glanceCards = [
    {
      title: "Average Score",
      value: isDemoMode ? currentRep?.avgScore ?? 0 : analytics?.avgScore ?? currentRep?.avgScore ?? 0,
      suffix: "/100",
      change: isDemoMode ? 4.2 : analytics?.changes.avgScore ?? 0,
      sparklineData: isDemoMode ? [84, 86, 87, 88, 89, 90, 90, 91, 91, 92, 93, 92] : analytics?.sparklines.avgScore ?? [0],
    },
    {
      title: "Calls This Week",
      value: callsThisWeek,
      change: isDemoMode ? 12.5 : analytics?.changes.callsSubmitted ?? 0,
      sparklineData: isDemoMode ? [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6] : analytics?.sparklines.callsSubmitted ?? [0],
    },
    {
      title: "Leaderboard Rank",
      value: rank,
      suffix: leaderboard.length > 0 ? `of ${leaderboard.length}` : "",
      change: isDemoMode ? 8.3 : analytics?.changes.leaderboardRank ?? 0,
      sparklineData: isDemoMode ? [4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1] : analytics?.sparklines.leaderboardRank ?? [rank || 0],
    },
    {
      title: "Closed Won Rate",
      value: closedWonRate,
      suffix: "%",
      change: isDemoMode ? 6.1 : analytics?.changes.closedWonRate ?? 0,
      sparklineData: isDemoMode ? [18, 20, 20, 24, 25, 27, 29, 30, 31, 32, 33, 33] : analytics?.sparklines.closedWonRate ?? [closedWonRate],
    },
  ]

  return (
    <RepDashboardLayout>
      <div className="p-4 md:p-6 lg:p-10 font-sans">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
              <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">Rep Home</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">Welcome back, {data.viewer?.name?.split(" ")[0] ?? "there"}</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Track your performance, review recent scorecards, and see where to improve next.
            </p>
          </div>
          <Link href="/rep/upload">
            <Button className="rounded-xl bg-lime py-6 px-6 text-sm font-semibold text-lime-950 shadow-[0_4px_14px_0_rgba(163,230,53,0.39)] transition-all hover:-translate-y-[1px] hover:bg-lime/90 hover:shadow-[0_6px_20px_rgba(163,230,53,0.23)]">
              <PhoneCall className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Upload Call</span>
            </Button>
          </Link>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {glanceCards.map((card) => (
            <GlanceCard
              key={card.title}
              title={card.title}
              value={card.value}
              suffix={card.suffix}
              change={card.change}
              sparklineData={card.sparklineData}
            />
          ))}
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-8 mt-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-lime/5 blur-3xl" />

          <div className="relative flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Recent Scores</h2>
            </div>
            <Link href="/rep/calls" className="inline-flex items-center gap-2 text-sm font-medium text-lime transition-colors hover:text-lime/80">
              View all calls
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="space-y-4">
            {recentScores.length > 0 ? (
              recentScores.map((call) => (
                <Link
                  key={call.id}
                  href={`/rep/calls/${call.id}`}
                  className="group block overflow-hidden rounded-2xl border border-border/40 bg-surface/30 p-5 transition-all hover:bg-surface/50 hover:border-lime/30"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        <span className="rounded-md border border-border/50 bg-background/50 px-2 py-0.5 text-foreground/80 font-medium">{call.playbook}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-lime/80 shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                          <span>{call.callType}</span>
                        </div>
                        <span className="text-border">•</span>
                        <span>{call.date}</span>
                      </div>
                      <div>
                        <p className="text-xl font-semibold tracking-tight text-foreground transition-colors group-hover:text-lime">{call.company}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="text-foreground/70">Top coaching moment:</span> {call.topMissedMoment}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[320px]">
                      <div className="flex flex-col justify-between rounded-xl border border-border/40 bg-background/40 p-4 transition-colors group-hover:bg-background/60">
                        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Score</p>
                        <div className="mt-2 flex items-baseline gap-1">
                          <p className="text-2xl font-light tracking-tight text-lime">{call.score}</p>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between rounded-xl border border-border/40 bg-background/40 p-4 transition-colors group-hover:bg-background/60">
                        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Adherence</p>
                        <div className="mt-2 flex items-baseline gap-1">
                          <p className="text-2xl font-light tracking-tight text-lime">{call.adherence}</p>
                          <span className="text-xs font-medium text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between rounded-xl border border-border/40 bg-background/40 p-4 transition-colors group-hover:bg-background/60">
                        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Outcome</p>
                        <p className="mt-2 text-sm font-medium text-foreground/90 capitalize">{call.outcome}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
                <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                  <PhoneCall className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-semibold text-foreground/90">No recent scores</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Upload a call to get your first AI scorecard.</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-8">
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-lime/5 blur-3xl" />
            <div className="relative">
              <h2 className="text-xl font-semibold tracking-tight">Score Trend</h2>
              <p className="mt-2 text-sm text-muted-foreground">Score movement across recent reviewed calls.</p>
              <div className="mt-6 space-y-4">
                {scoreTrendWithDelta.length > 0 ? (
                  scoreTrendWithDelta.map((item, index) => {
                    const positive = item.delta >= 0

                    return (
                      <div key={`${item.day}-${index}`} className="overflow-hidden rounded-2xl border border-border/40 bg-surface/30 p-4 transition-colors hover:bg-surface/50">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground/90">{item.day}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                              {item.delta === 0 ? "Starting point" : positive ? "Up from previous call" : "Down from previous call"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-light tracking-tight text-lime">{item.score}</span>
                            <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 gap-1 text-[10px] font-mono uppercase tracking-wider font-semibold ${positive ? "bg-lime/10 text-lime" : "bg-destructive/10 text-destructive"}`}>
                              {item.delta === 0 ? null : positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {item.delta === 0 ? "base" : `${positive ? "+" : ""}${item.delta}`}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full border border-border/20 bg-background/50">
                          <div
                            className="h-full bg-lime shadow-[0_0_10px_rgba(163,230,53,0.5)] rounded-full transition-all duration-1000"
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center h-[200px] rounded-2xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
                    <div className="w-12 h-12 rounded-full bg-surface/50 border border-border/40 flex items-center justify-center mb-3 shadow-inner">
                      <ArrowUpRight className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-semibold text-foreground/90">No trend data yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Upload more calls to see your score momentum.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-8">
            <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-lime/5 blur-3xl" />
            <div className="relative flex flex-col h-full">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Leaderboard Position</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Your place this week</p>
                </div>
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-lime/10 border border-lime/20">
                  <Trophy className="h-5 w-5 text-lime" />
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {leaderboard.length > 0 ? (
                  leaderboard.slice(0, 4).map((rep, index) => (
                    <div
                      key={rep.id}
                      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all ${
                        currentRep && rep.id === currentRep.id ? "border-lime/40 bg-lime/5 shadow-[0_0_15px_rgba(163,230,53,0.05)]" : "border-border/40 bg-surface/30 hover:bg-surface/50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                          index === 0 ? "bg-amber-400/20 text-amber-400" :
                          index === 1 ? "bg-slate-300/20 text-slate-300" :
                          index === 2 ? "bg-amber-700/20 text-amber-600" :
                          "bg-surface text-muted-foreground"
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground/90">{rep.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Average score</p>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-light tracking-tight text-lime">{rep.avgScore}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center h-[200px] rounded-2xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
                    <div className="w-12 h-12 rounded-full bg-surface/50 border border-border/40 flex items-center justify-center mb-3 shadow-inner">
                      <Trophy className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-semibold text-foreground/90">Leaderboard empty</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Rankings will appear once calls are submitted.</p>
                  </div>
                )}
              </div>
              <Link href="/rep/leaderboard" className="mt-6 inline-flex w-full items-center justify-end gap-2 text-sm font-medium text-lime transition-colors hover:text-lime/80">
                Open leaderboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-8">
            <h2 className="text-xl font-semibold tracking-tight">Where You Are Strongest</h2>
            <div className="mt-6 space-y-4">
              {strongestSkill ? (
                <div className="rounded-2xl border border-border/40 bg-surface/30 p-5 transition-colors hover:bg-surface/50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Strongest Skill</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-light tracking-tight text-lime">{strongestSkill.score}</span>
                      <span className="text-xs text-muted-foreground font-medium">/{strongestSkill.outOf}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-lg font-medium text-foreground">{strongestSkill.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{strongestSkill.detail}</p>
                  {strongestSkill.sourceCallId ? (
                    <div className="mt-4 flex justify-end">
                      <Link
                        href={`/rep/calls/${strongestSkill.sourceCallId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-lime/30 hover:bg-lime/5 hover:text-lime shadow-sm"
                      >
                        Evident in {strongestSkill.sourceCallLabel}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/40 bg-surface/30 p-5 transition-colors flex flex-col items-center justify-center h-32 text-center">
                  <p className="text-sm font-semibold text-foreground/90">No skill data</p>
                  <p className="text-xs text-muted-foreground mt-1">Upload a call to analyze skills</p>
                </div>
              )}

              {strongestSkill ? (
                <div className="rounded-2xl border border-border/40 bg-surface/30 p-5 transition-colors hover:bg-surface/50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Playbook Adherence</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-light tracking-tight text-lime">{playbookAdherence}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-lg font-medium text-foreground">{playbookAdherenceHeadline}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {isDemoMode
                      ? "You are staying close to the active playbook on discovery structure and product positioning."
                      : playbookAdherenceDetail}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/40 bg-surface/30 p-5 transition-colors flex flex-col items-center justify-center h-32 text-center">
                  <p className="text-sm font-semibold text-foreground/90">No adherence data</p>
                  <p className="text-xs text-muted-foreground mt-1">Waiting for rubric evaluation data.</p>
                </div>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-8">
            <h2 className="text-xl font-semibold tracking-tight">What To Improve Next</h2>
            <div className="mt-6 space-y-4">
              {weakestSkill ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 transition-colors hover:bg-amber-500/10">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-mono uppercase tracking-wider text-amber-500/70">Weakest Skill</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-light tracking-tight text-amber-500">{weakestSkill.score}</span>
                      <span className="text-xs text-amber-500/50 font-medium">/{weakestSkill.outOf}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-lg font-medium text-amber-500/90">{weakestSkill.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-amber-500/70">{weakestSkill.detail}</p>
                  {weakestSkill.sourceCallId ? (
                    <div className="mt-4 flex justify-end">
                      <Link
                        href={`/rep/calls/${weakestSkill.sourceCallId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
                      >
                        Evident in {weakestSkill.sourceCallLabel}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/40 bg-surface/30 p-5 transition-colors flex flex-col items-center justify-center h-32 text-center">
                  <p className="text-sm font-semibold text-foreground/90">No skill data</p>
                  <p className="text-xs text-muted-foreground mt-1">Upload a call to analyze skills</p>
                </div>
              )}

              {isDemoMode || mostImprovedCategory ? (
                <div className="rounded-2xl border border-border/40 bg-surface/30 p-5 transition-colors hover:bg-surface/50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Most Improved Category</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-light tracking-tight text-lime">
                        {isDemoMode ? "+12%" : `+${analytics?.mostImprovedCategory?.change ?? 0}`}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-lg font-medium text-foreground">{mostImprovedCategory}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {isDemoMode
                      ? "Budget and decision-process questions are improving. Keep pushing that into every first call."
                      : analytics?.mostImprovedCategory?.detail}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/40 bg-surface/30 p-5 transition-colors flex flex-col items-center justify-center h-32 text-center">
                  <p className="text-sm font-semibold text-foreground/90">No improvement detected yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Score a few more calls to see category trends.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </RepDashboardLayout>
  )
}
