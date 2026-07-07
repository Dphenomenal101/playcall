"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { GlanceCard } from "@/components/dashboard/glance-card"
import { IncompleteSetupBanner } from "@/components/dashboard/incomplete-setup-banner"
import { TrendingUp, PhoneCall, BookCopy, ArrowRight, Trophy, ChevronDown, Check, Sparkles, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMemo, useState } from "react"
import Link from "next/link"
import { capitalizeFirst } from "@/lib/utils"
import { CALL_TYPES, DEAL_STAGES, OUTCOMES, normalizeFilterValue } from "@/lib/playcall-data"
import { buildManagerAnalytics, isWinOutcome } from "@/lib/data/live-analytics"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ManagerWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"

const ALL_VALUE = "all"

const DATE_RANGES: Array<{ value: string; label: string }> = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last quarter" },
  { value: "365", label: "Year to date" },
  { value: ALL_VALUE, label: "All time" },
]

function ManagerDashboardInner({ initialData }: { initialData: ManagerWorkspaceData }) {
  const [dateRange, setDateRange] = useState(ALL_VALUE)
  const [repFilter, setRepFilter] = useState(ALL_VALUE)
  const [playbookFilter, setPlaybookFilter] = useState(ALL_VALUE)
  const [callTypeFilter, setCallTypeFilter] = useState(ALL_VALUE)
  const [stageFilter, setStageFilter] = useState(ALL_VALUE)
  const [outcomeFilter, setOutcomeFilter] = useState(ALL_VALUE)

  const data = initialData

  const allCalls = data.calls
  const allReps = data.reps

  const repOptions = [
    { value: ALL_VALUE, label: "All reps" },
    ...Array.from(new Set(allCalls.map((call) => call.rep))).map((name) => ({ value: name, label: name })),
  ]
  const playbookOptions = [
    { value: ALL_VALUE, label: "All playbooks" },
    ...Array.from(new Set(allCalls.map((call) => call.playbook))).map((name) => ({ value: name, label: name })),
  ]
  const callTypeOptions = [{ value: ALL_VALUE, label: "All call types" }, ...CALL_TYPES]
  const stageOptions = [{ value: ALL_VALUE, label: "All stages" }, ...DEAL_STAGES]
  const outcomeOptions = [{ value: ALL_VALUE, label: "All outcomes" }, ...OUTCOMES]

  const filterDefs = [
    { key: "date", label: "Date range", value: dateRange, setValue: setDateRange, options: DATE_RANGES },
    { key: "rep", label: "Rep", value: repFilter, setValue: setRepFilter, options: repOptions },
    { key: "playbook", label: "Playbook", value: playbookFilter, setValue: setPlaybookFilter, options: playbookOptions },
    { key: "callType", label: "Call type", value: callTypeFilter, setValue: setCallTypeFilter, options: callTypeOptions },
    { key: "stage", label: "Deal stage", value: stageFilter, setValue: setStageFilter, options: stageOptions },
    { key: "outcome", label: "Outcome", value: outcomeFilter, setValue: setOutcomeFilter, options: outcomeOptions },
  ]

  const filteredCalls = useMemo(
    () =>
      allCalls.filter((call) => {
        const matchesDate = (() => {
          if (dateRange === ALL_VALUE) return true
          const days = Number(dateRange)
          const callDate = new Date(call.date)
          if (Number.isNaN(callDate.getTime())) return true
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() - days)
          return callDate >= cutoff
        })()

        const matchesRep = repFilter === ALL_VALUE || call.rep === repFilter
        const matchesPlaybook = playbookFilter === ALL_VALUE || call.playbook === playbookFilter
        const matchesCallType =
          callTypeFilter === ALL_VALUE || normalizeFilterValue(call.callType) === normalizeFilterValue(callTypeFilter)
        const matchesStage =
          stageFilter === ALL_VALUE ||
          normalizeFilterValue(call.dealStageAfter) === normalizeFilterValue(stageFilter) ||
          normalizeFilterValue(call.dealStageBefore) === normalizeFilterValue(stageFilter)
        const matchesOutcome =
          outcomeFilter === ALL_VALUE ||
          normalizeFilterValue(call.outcome) ===
            normalizeFilterValue(OUTCOMES.find((o) => o.value === outcomeFilter)?.dbValue ?? outcomeFilter)

        return matchesDate && matchesRep && matchesPlaybook && matchesCallType && matchesStage && matchesOutcome
      }),
    [allCalls, dateRange, repFilter, playbookFilter, callTypeFilter, stageFilter, outcomeFilter]
  )

  const filteredReps = useMemo(
    () => (repFilter === ALL_VALUE ? allReps : allReps.filter((rep) => rep.name === repFilter)),
    [allReps, repFilter]
  )

  // Recomputing the full analytics bundle from the filtered slice (rather than
  // reading the unfiltered server snapshot) is what makes every section below
  // react to the filter bar - the same pure builder backs both this dashboard
  // and the live API route, so results stay consistent either way.
  const analytics = useMemo(() => buildManagerAnalytics(filteredReps, filteredCalls), [filteredReps, filteredCalls])

  const glanceCards = [
    {
      title: "Average Score",
      value: analytics.metrics.avgScore,
      suffix: "/100",
      change: analytics.changes.avgScore,
      sparklineData: analytics.sparklines.avgScore,
    },
    {
      title: "Playbook Adherence",
      value: analytics.metrics.adherenceRate,
      suffix: "%",
      change: analytics.changes.adherenceRate,
      sparklineData: analytics.sparklines.adherenceRate,
    },
    {
      title: "Calls Submitted",
      value: analytics.metrics.callsSubmitted,
      change: analytics.changes.callsSubmitted,
      sparklineData: analytics.sparklines.callsSubmitted,
    },
    {
      title: "Team Win Rate",
      value: analytics.metrics.winRate,
      suffix: "%",
      change: analytics.changes.winRate,
      sparklineData: analytics.sparklines.winRate,
    },
  ]

  const strongestCategories = analytics.strongestCategories
  const weakestCategories = analytics.weakestCategories
  const outcomeConversion = analytics.outcomeConversion
  const liveImprovements = analytics.improvements
  const liveCoachingAlerts = analytics.coachingAlerts
  const wonPatterns = analytics.wonPatterns
  const lostPatterns = analytics.lostPatterns

  const displayCalls = filteredCalls

  // Rep stats (avg score, win rate, calls analyzed) recomputed from the
  // filtered calls rather than read off the rep record, so the leaderboard
  // narrows along with everything else when a filter is active.
  const topPerformers = useMemo(() => {
    const callsByRepName = new Map<string, typeof filteredCalls>()
    for (const call of filteredCalls) {
      const list = callsByRepName.get(call.rep) ?? []
      list.push(call)
      callsByRepName.set(call.rep, list)
    }

    return filteredReps
      .filter((rep) => rep.role === "Sales Rep")
      .map((rep) => {
        const repCalls = callsByRepName.get(rep.name) ?? []
        const scored = repCalls.filter((call) => Number.isFinite(call.score) && call.score > 0)
        const avgScore = scored.length > 0 ? Math.round(scored.reduce((sum, call) => sum + call.score, 0) / scored.length) : 0
        const positiveCount = repCalls.filter((call) => isWinOutcome(call.outcome)).length
        const winRatePercent = repCalls.length > 0 ? Math.round((positiveCount / repCalls.length) * 100) : 0
        // A rep who actually closes deals should outrank one who just scores
        // well internally but wins nothing - weight win rate (the real
        // business outcome) above the rubric score, not the other way around.
        const rankScore = winRatePercent * 0.6 + avgScore * 0.4
        return { id: rep.id, name: rep.name, avgScore, winRate: `${winRatePercent}%`, callsAnalyzed: repCalls.length, rankScore }
      })
      .filter((rep) => rep.callsAnalyzed > 0)
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, 4)
  }, [filteredReps, filteredCalls])

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
              <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">Manager View</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Team performance, coaching coverage, and outcome movement across scored calls
            </p>
          </div>
          <Link href="/manager/playbooks/new">
            <Button
              size="sm"
              className="gap-2 rounded-xl bg-lime text-background hover:bg-lime/90 transition-all shadow-[0_0_20px_rgba(217,249,157,0.3)]"
            >
              <BookCopy className="w-4 h-4" />
              <span className="hidden sm:inline">Create Playbook</span>
            </Button>
          </Link>
        </div>
      </div>

      <IncompleteSetupBanner missingProviderRoles={data.missingProviderRoles ?? []} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filterDefs.map((filter) => {
          const selectedLabel = filter.options.find((opt) => opt.value === filter.value)?.label ?? filter.options[0].label

          return (
            <DropdownMenu key={filter.key}>
              <DropdownMenuTrigger asChild>
                <button className="flex flex-col items-start px-3 py-1.5 rounded-xl border border-border/40 bg-card/40 hover:bg-card/60 transition-colors text-left min-w-[120px]">
                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">{filter.label}</span>
                  <div className="flex items-center gap-1 mt-0.5 w-full">
                    <span className="text-xs font-medium text-foreground/90">{selectedLabel}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[160px] rounded-xl">
                {filter.options.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    className="text-xs rounded-lg cursor-pointer"
                    onSelect={() => filter.setValue(opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
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

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 items-start">

        {/* Left Column (Spans 2) */}
        <div className="xl:col-span-2 flex flex-col gap-4 md:gap-6">
          {/* Recent Calls */}
          <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground/90">Recent Calls</h2>
              <Link href="/manager/calls" className="inline-flex items-center gap-2 text-xs font-medium text-lime hover:text-lime/80 transition-colors bg-lime/5 hover:bg-lime/10 px-3 py-1.5 rounded-full border border-lime/10">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {displayCalls.length > 0 ? (
                displayCalls.slice(0, 5).map((call) => (
                  <Link
                    key={call.id}
                    href={`/manager/calls/${call.id}`}
                    className="group flex items-center gap-4 p-4 rounded-2xl bg-surface/30 hover:bg-surface/50 border border-border/40 transition-all"
                  >
                    {/* Score Block */}
                    <div className="w-12 h-12 rounded-xl bg-lime/5 border border-lime/20 flex flex-col items-center justify-center shrink-0 group-hover:bg-lime/10 transition-colors">
                      <span className="text-sm font-bold text-lime leading-tight">{call.score}</span>
                      <span className="text-[8px] uppercase tracking-wider text-lime/70">Score</span>
                    </div>

                    {/* Main Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <p className="text-sm font-semibold truncate text-foreground/90 group-hover:text-lime transition-colors">{call.company}</p>
                        <span className="px-2 py-0.5 rounded-full bg-background/50 text-[10px] font-medium text-muted-foreground border border-border/50 shadow-sm shrink-0">
                          {call.dealStageBefore || "Discovery"}
                        </span>
                        {call.outcome && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-sm shrink-0 ${
                            call.outcome.toLowerCase().includes("booked") || call.outcome.toLowerCase().includes("moved") || call.outcome.toLowerCase().includes("won")
                              ? "bg-lime/10 text-lime border-lime/20"
                              : call.outcome.toLowerCase().includes("lost") || call.outcome.toLowerCase().includes("no-show")
                                ? "bg-destructive/10 text-destructive border-destructive/20"
                                : "bg-surface text-muted-foreground border-border/50"
                          }`}>
                            {capitalizeFirst(call.outcome)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{call.rep}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span className="truncate">{call.playbook}</span>
                      </div>
                    </div>

                    {/* Right Stats */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0 hidden sm:flex">
                      <div className="flex items-center gap-2 bg-surface/50 px-2 py-1 rounded-md border border-border/30">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Adherence</span>
                        <span className="text-xs font-mono font-medium text-foreground/90">{call.adherence}%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{call.date}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                    <PhoneCall className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-semibold text-foreground/90">No calls analyzed yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Waiting for your reps to submit their first calls for scoring.</p>
                </div>
              )}
            </div>
          </div>

          {/* Secondary Insights (Nested 2-column grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-stretch">
            {/* What Changed? */}
            <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground/90">What Changed?</h2>
                <span className="text-[10px] text-muted-foreground font-medium bg-surface/50 px-2 py-1 rounded-md border border-border/30">vs Last Week</span>
              </div>
              <div className="space-y-3 flex-1">
                {liveImprovements.length > 0 ? (
                  liveImprovements.map((item) => (
                    <div key={item.name} className="relative rounded-2xl border border-border/40 bg-surface/20 p-4 hover:bg-surface/40 transition-colors group overflow-hidden">
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground/90 truncate">{item.name}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[10px] font-mono text-muted-foreground bg-surface/50 px-1.5 py-0.5 rounded">{item.old}</span>
                            <div className="flex-1 h-[2px] bg-border/40 relative rounded-full">
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-lime shadow-[0_0_8px_rgba(163,230,53,0.5)]" />
                              <div className="absolute left-0 top-0 h-full bg-lime/30 rounded-full w-full" />
                            </div>
                            <span className="text-[10px] font-mono text-foreground font-semibold bg-lime/10 text-lime px-1.5 py-0.5 rounded">{item.new}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-center shrink-0">
                          <span className="text-sm font-bold text-lime">{item.delta}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-dashed border-border/40 bg-surface/10">
                    <div className="w-10 h-10 rounded-full bg-surface/50 border border-border/50 flex items-center justify-center mb-3">
                      <TrendingUp className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-foreground/80">No trends yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Not enough data to show performance trends.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Score vs. Progress Rate */}
            <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm flex flex-col h-full">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground/90">Score vs. Progress Rate</h2>
                <p className="text-[10px] text-muted-foreground mt-1">Correlation between playbook adherence and positive outcomes.</p>
              </div>
              <div className="flex flex-col justify-between flex-1 gap-3">
                {outcomeConversion.some(item => item.detail !== "No scored calls in this range yet.") ? (
                  outcomeConversion.map((item) => (
                    <div key={item.band} className="relative rounded-2xl border border-border/40 bg-surface/20 p-3 hover:bg-surface/40 transition-colors group overflow-hidden flex flex-col justify-center">
                      <div className="flex items-center justify-between mb-2 relative z-10">
                        <span className="text-[10px] font-mono font-medium text-foreground/80 bg-surface px-1.5 py-0.5 rounded border border-border/50 shadow-sm">Score {item.band}</span>
                        <span className="text-xs font-bold text-lime">{item.value} Progress Rate</span>
                      </div>
                      <div className="w-full h-1 bg-surface rounded-full overflow-hidden relative z-10">
                        <div className="h-full bg-lime/80 rounded-full" style={{ width: item.value }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-dashed border-border/40 bg-surface/10">
                    <div className="w-10 h-10 rounded-full bg-surface/50 border border-border/50 flex items-center justify-center mb-3">
                      <Activity className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-foreground/80">No correlation data</p>
                    <p className="text-xs text-muted-foreground mt-1">Score more calls to see how playbook adherence impacts deal progression.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {wonPatterns.length > 0 || lostPatterns.length > 0 ? (
            <div className="flex flex-col gap-4 md:gap-6">
              {wonPatterns.length > 0 && (
                <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-foreground/90">Won Call Patterns</h2>
                  <div className="mt-4 space-y-3">
                    {wonPatterns.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-border/40 bg-surface/20 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold text-foreground/90">{item.label}</p>
                          <span className="text-xs font-mono text-lime bg-lime/10 px-2 py-1 rounded-md border border-lime/20">{item.score}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {lostPatterns.length > 0 && (
                <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-foreground/90">Lost Call Patterns</h2>
                  <div className="mt-4 space-y-3">
                    {lostPatterns.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="rounded-2xl border border-border/40 bg-surface/20 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold text-foreground/90">{item.label}</p>
                          <span className="text-xs font-mono text-destructive bg-destructive/10 px-2 py-1 rounded-md border border-destructive/20">{item.score}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Right Column (Spans 1) */}
        <div className="flex flex-col gap-4 md:gap-6 h-full">
          {/* Needs Coaching */}
          <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm flex flex-col flex-1">
            <h2 className="text-lg font-semibold text-foreground/90 mb-4">Needs Coaching</h2>
            <div className="space-y-3 flex-1">
              {liveCoachingAlerts.length > 0 ? (
                liveCoachingAlerts.map((rep) => (
                  <div key={rep.id} className="relative rounded-2xl border border-border/40 bg-surface/20 p-3 hover:bg-surface/40 transition-colors group overflow-hidden">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-border/50 bg-background/50 shadow-sm mt-0.5">
                        <span className="text-sm font-semibold text-muted-foreground group-hover:text-destructive transition-colors">!</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground/90 truncate">{rep.name}</p>
                        <p className="text-[10px] font-medium text-destructive mt-0.5">{rep.reason}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{rep.detail}</p>
                      </div>
                      <div className="flex flex-col items-end shrink-0 mt-0.5">
                        <span className="text-sm font-mono font-bold text-destructive bg-destructive/10 px-2 py-1 rounded-lg border border-destructive/20">{rep.metric}</span>
                      </div>
                    </div>
                    {rep.sourceCallId ? (
                      <div className="mt-2 flex justify-end">
                        <Link
                          href={`/manager/calls/${rep.sourceCallId}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive shadow-sm"
                        >
                          Evident in {rep.sourceCallLabel}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-dashed border-border/40 bg-surface/10">
                  <div className="w-10 h-10 rounded-full bg-surface/50 border border-border/50 flex items-center justify-center mb-3">
                    <Check className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground/80">All clear</p>
                  <p className="text-xs text-muted-foreground mt-1">No urgent coaching alerts at this time.</p>
                </div>
              )}
            </div>
          </div>

          {/* Coaching Opportunities */}
          <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm flex flex-col flex-1">
            <h2 className="text-lg font-semibold text-foreground/90 mb-4">Coaching Opportunities</h2>
            <div className="space-y-3 flex-1">
              {weakestCategories.length > 0 ? (
                weakestCategories.map((item) => (
                  <div key={item.label} className="relative rounded-2xl border border-border/40 bg-surface/20 p-4 hover:bg-surface/40 transition-colors group overflow-hidden">
                    <div className="flex gap-4 relative z-10 h-full items-center">
                      <div className="flex flex-col items-center justify-center shrink-0 w-10">
                        <span className="text-lg font-bold text-destructive">{item.score}</span>
                        <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Avg</span>
                      </div>
                      <div className="w-px h-10 bg-border/40" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground/90 truncate">{item.label}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{item.detail}</p>
                        {item.sourceCallId ? (
                          <div className="mt-2 flex justify-end">
                            <Link
                              href={`/manager/calls/${item.sourceCallId}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive shadow-sm"
                            >
                              Evident in {item.sourceCallLabel}
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : strongestCategories.length > 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-dashed border-border/40 bg-surface/10">
                  <div className="w-10 h-10 rounded-full bg-surface/50 border border-border/50 flex items-center justify-center mb-3">
                    <Sparkles className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground/80">Outstanding performance</p>
                  <p className="text-xs text-muted-foreground mt-1">No coaching gaps. Every category is scoring 80 or above.</p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-dashed border-border/40 bg-surface/10">
                  <div className="w-10 h-10 rounded-full bg-surface/50 border border-border/50 flex items-center justify-center mb-3">
                    <Activity className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground/80">Awaiting data</p>
                  <p className="text-xs text-muted-foreground mt-1">Waiting for rubric evaluation data.</p>
                </div>
              )}
            </div>
          </div>

          {/* Top Performers */}
          <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-6 shadow-sm flex flex-col flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground/90 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-lime" /> Top Performers
              </h2>
            </div>
            <div className="space-y-3">
              {topPerformers.length > 0 ? (
                topPerformers
                  .map((rep, i) => (
                    <div key={rep.id} className="relative rounded-2xl border border-border/40 bg-surface/20 p-3 hover:bg-surface/40 transition-colors group overflow-hidden flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm transition-colors ${i === 0 ? "bg-lime/20 border-lime/40 group-hover:border-lime" : "bg-background/50 border-border/50 group-hover:border-lime/30"}`}>
                        <span className={`text-[10px] font-mono font-bold ${i === 0 ? "text-lime drop-shadow-[0_0_8px_rgba(163,230,53,0.8)]" : "text-muted-foreground group-hover:text-lime transition-colors"}`}>#{i + 1}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground/90 truncate">{rep.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{rep.callsAnalyzed} call{rep.callsAnalyzed === 1 ? "" : "s"}</span>
                          <span className="w-1 h-1 rounded-full bg-border/80" />
                          <span className="text-[10px] text-lime/80 font-medium truncate">{rep.winRate} win rate</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-sm font-mono font-bold text-lime bg-lime/10 px-2 py-1 rounded-lg border border-lime/20">{rep.avgScore}</span>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-dashed border-border/40 bg-surface/10">
                  <div className="w-10 h-10 rounded-full bg-surface/50 border border-border/50 flex items-center justify-center mb-3">
                    <Trophy className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground/80">Leaderboard empty</p>
                  <p className="text-xs text-muted-foreground mt-1">Score some calls to see top performers.</p>
                </div>
              )}
            </div>
            <Link href="/manager/leaderboard" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-lime hover:text-lime/80 transition-colors w-full justify-center p-2.5 rounded-xl bg-lime/5 border border-lime/10 hover:bg-lime/10">
              View Full Leaderboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ManagerDashboardClient({ initialData }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const { data } = useDemoLiveResource({
    demoData: getDemoManagerWorkspaceData(),
    liveUrl: "/api/live/manager",
    emptyData: initialData,
  })
  return (
    <DashboardLayout>
      <ManagerDashboardInner initialData={data} />
    </DashboardLayout>
  )
}

export default function ManagerDashboard() {
  return (
    <DashboardLayout>
      <ManagerDashboardInner initialData={{ viewer: null, calls: [], playbooks: [], reps: [], invites: [] }} />
    </DashboardLayout>
  )
}
