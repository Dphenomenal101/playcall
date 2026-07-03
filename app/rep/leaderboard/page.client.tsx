"use client"

import { RepDashboardLayout } from "@/components/dashboard/rep-dashboard-layout"
import { Trophy } from "lucide-react"
import type { RepWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoRepWorkspaceData } from "@/lib/data/demo-workspace"

export function RepLeaderboardClient({ initialData }: { initialData: RepWorkspaceData; isDemoMode: boolean }) {
  const { isDemoMode } = useDemo()
  const { data } = useDemoLiveResource({
    demoData: getDemoRepWorkspaceData(),
    liveUrl: "/api/live/rep",
    emptyData: initialData,
  })
  const hasLoaded = true
  const leaderboard = isDemoMode
    ? data.leaderboard
    : data.leaderboard
  const currentRepId = data.currentRep?.id

  return (
    <RepDashboardLayout>
      <div className="p-4 md:p-6 lg:p-10 font-sans">
        <div className="mb-10 max-w-3xl">
          <div className="mb-4 inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
            <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">Leaderboard</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">Weekly rep ranking</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            See where you rank this week by average score and playbook adherence momentum.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {!hasLoaded ? (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-lime/30 border-t-lime" />
              <p className="mt-4 text-sm font-semibold text-foreground/90">Loading leaderboard...</p>
            </div>
          ) : leaderboard.length > 0 ? (
            leaderboard.map((rep, index) => {
              const isCurrent = rep.id === currentRepId
              const rank = index + 1
              const isTopThree = rank <= 3

              return (
                <div
                  key={rep.id}
                  className={`group relative flex flex-col gap-5 overflow-hidden rounded-3xl border p-6 shadow-sm backdrop-blur-xl transition-all md:flex-row md:items-center md:justify-between ${
                    isCurrent
                      ? "border-lime/30 bg-lime/5 hover:bg-lime/10"
                      : "border-border/40 bg-card/40 hover:bg-card/50"
                  }`}
                >
                  {isCurrent && (
                    <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-lime/10 blur-3xl transition-all group-hover:bg-lime/20" />
                  )}

                  <div className="relative flex items-center gap-5">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-xl font-light tracking-tighter ${
                      isTopThree && !isCurrent
                        ? "border-amber-400/20 bg-amber-400/5 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.1)]"
                        : isCurrent
                          ? "border-lime/30 bg-lime/10 text-lime shadow-[0_0_15px_rgba(163,230,53,0.15)]"
                          : "border-border/40 bg-surface/30 text-muted-foreground"
                    }`}>
                      #{rank}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold tracking-tight text-foreground/90">{rep.name}</p>
                        {isCurrent && (
                          <span className="rounded-full border border-lime/20 bg-lime/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-lime">
                            You
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground line-clamp-1 flex flex-wrap gap-2">
                        {rep.playbooks.map(playbook => (
                           <span key={playbook} className="rounded-md border border-border/30 bg-background/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                             {playbook}
                           </span>
                        ))}
                      </p>
                    </div>
                  </div>

                  <div className="relative grid grid-cols-2 gap-3 sm:flex sm:min-w-[280px]">
                    <div className={`flex flex-1 flex-col justify-between rounded-2xl border p-4 transition-colors ${
                      isCurrent ? "border-lime/20 bg-lime/5" : "border-border/40 bg-surface/30 hover:bg-surface/50"
                    }`}>
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Average score</p>
                      <div className="mt-3 flex items-baseline gap-1">
                        <p className={`text-2xl font-light tracking-tight ${isCurrent ? "text-lime" : isTopThree ? "text-amber-400" : "text-foreground"}`}>
                          {rep.avgScore}
                        </p>
                        <span className="text-xs font-medium text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <div className={`flex flex-1 flex-col justify-between rounded-2xl border p-4 transition-colors ${
                      isCurrent ? "border-lime/20 bg-lime/5" : "border-border/40 bg-surface/30 hover:bg-surface/50"
                    }`}>
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Status</p>
                      <p className="mt-3 text-sm font-medium text-foreground/90 truncate">{rep.status}</p>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                <Trophy className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground/90">Leaderboard empty</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">The weekly leaderboard will populate once reps start submitting calls.</p>
            </div>
          )}
        </div>
      </div>
    </RepDashboardLayout>
  )
}
