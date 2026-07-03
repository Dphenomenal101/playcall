"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { TrendingUp, TrendingDown, Target, PhoneCall, Trophy } from "lucide-react"
import type { ManagerWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"

function LeaderboardPageInner({ initialData, isDemoMode }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const [activeCategory, setActiveCategory] = useState("overall")

  const categories = ["overall", "discovery", "objection-handling", "next-step-clarity", "playbook-adherence", "most-improved"]

  const leaderboardData: Record<string, Array<{ rank: number; name: string; score: number; change: number }>> = {
    overall: [
      { rank: 1, name: "Sarah Chen", score: 92, change: 5 },
      { rank: 2, name: "Emma Wilson", score: 91, change: 3 },
      { rank: 3, name: "Jessica Lee", score: 88, change: -2 },
      { rank: 4, name: "Michael Torres", score: 85, change: 8 },
      { rank: 5, name: "David Park", score: 76, change: -1 },
    ],
    discovery: [
      { rank: 1, name: "Michael Torres", score: 94, change: 6 },
      { rank: 2, name: "Sarah Chen", score: 91, change: 4 },
      { rank: 3, name: "Jessica Lee", score: 89, change: -3 },
      { rank: 4, name: "Emma Wilson", score: 87, change: 2 },
      { rank: 5, name: "David Park", score: 78, change: 1 },
    ],
    "objection-handling": [
      { rank: 1, name: "Jessica Lee", score: 90, change: -1 },
      { rank: 2, name: "Sarah Chen", score: 89, change: 5 },
      { rank: 3, name: "Michael Torres", score: 86, change: 7 },
      { rank: 4, name: "Emma Wilson", score: 85, change: 2 },
      { rank: 5, name: "David Park", score: 74, change: 0 },
    ],
    "next-step-clarity": [
      { rank: 1, name: "Sarah Chen", score: 94, change: 4 },
      { rank: 2, name: "Emma Wilson", score: 90, change: 3 },
      { rank: 3, name: "Michael Torres", score: 88, change: 6 },
      { rank: 4, name: "Jessica Lee", score: 86, change: -2 },
      { rank: 5, name: "David Park", score: 79, change: 2 },
    ],
    "playbook-adherence": [
      { rank: 1, name: "Emma Wilson", score: 92, change: 4 },
      { rank: 2, name: "Sarah Chen", score: 89, change: 3 },
      { rank: 3, name: "Jessica Lee", score: 84, change: 2 },
      { rank: 4, name: "Michael Torres", score: 81, change: 5 },
      { rank: 5, name: "David Park", score: 73, change: 1 },
    ],
    "most-improved": [
      { rank: 1, name: "Michael Torres", score: 14, change: 8 },
      { rank: 2, name: "David Park", score: 11, change: 6 },
      { rank: 3, name: "Jessica Lee", score: 9, change: 3 },
      { rank: 4, name: "Emma Wilson", score: 8, change: 2 },
      { rank: 5, name: "Sarah Chen", score: 6, change: 1 },
    ],
  }

  const categoryLabels: Record<string, string> = {
    overall: "Overall Score",
    discovery: "Discovery",
    "objection-handling": "Objection Handling",
    "next-step-clarity": "Next-Step Clarity",
    "playbook-adherence": "Playbook Adherence",
    "most-improved": "Most Improved",
  }

  const workspaceData = initialData
  const analytics = workspaceData.analytics

  const liveLeaderboard = analytics?.leaderboard?.[activeCategory as keyof typeof analytics.leaderboard] ?? []

  const data = isDemoMode ? leaderboardData[activeCategory] : liveLeaderboard

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
              Rankings
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Weekly rankings across the coaching categories that matter
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={activeCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(cat)}
            className={activeCategory === cat ? "rounded-xl bg-lime px-4 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all" : "rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:bg-surface/50"}
          >
            {categoryLabels[cat]}
          </Button>
        ))}
      </div>

      {/* Leaderboard Table */}
      <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface/30 border-b border-border/40">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80 w-16">Rank</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Rep</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Calls Analyzed</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Win Rate</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">{categoryLabels[activeCategory]}</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-foreground/80">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.length > 0 ? (
                data.map((rep, idx) => {
                  const isTopThree = rep.rank <= 3;
                  // Find rep assignment to get extra data
                  const repData = workspaceData.reps.find(r => r.name === rep.name) || { callsAnalyzed: 0, winRate: "0%" };

                  return (
                  <tr key={idx} className="hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                        isTopThree ? "bg-lime/10 border-lime/20 shadow-[0_0_15px_rgba(163,230,53,0.1)]" : "bg-surface/30 border-border/40"
                      }`}>
                        <span className={`text-sm font-bold ${isTopThree ? "text-lime" : "text-muted-foreground"}`}>#{rep.rank}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className={`text-sm font-medium ${isTopThree ? "text-foreground/90" : "text-foreground/80"}`}>{rep.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <PhoneCall className="w-3.5 h-3.5" />
                        {repData.callsAnalyzed}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Target className="w-3.5 h-3.5" />
                        {repData.winRate}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono bg-lime/10 text-lime px-3 py-1.5 rounded-md">{rep.score}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 text-sm">
                        {rep.change > 0 ? (
                          <TrendingUp className="w-4 h-4 text-lime" />
                        ) : rep.change < 0 ? (
                          <TrendingDown className="w-4 h-4 text-destructive" />
                        ) : (
                          <span className="w-4 text-center text-muted-foreground">−</span>
                        )}
                        <span className={`font-mono text-sm ${rep.change > 0 ? "text-lime" : rep.change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {rep.change > 0 ? "+" : ""}{rep.change}
                        </span>
                      </div>
                    </td>
                  </tr>
                )})
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                        <Trophy className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm font-semibold text-foreground/90">Leaderboard is empty</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">The leaderboard will populate once your reps start submitting calls for scoring.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function LeaderboardPageClient({ initialData }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const { isDemoMode } = useDemo()
  const { data } = useDemoLiveResource({
    demoData: getDemoManagerWorkspaceData(),
    liveUrl: "/api/live/manager",
    emptyData: initialData,
  })
  return (
    <DashboardLayout>
      <LeaderboardPageInner initialData={data} isDemoMode={isDemoMode} />
    </DashboardLayout>
  )
}

export default function LeaderboardPage() {
  return (
    <DashboardLayout>
      <LeaderboardPageInner initialData={{ viewer: null, calls: [], playbooks: [], reps: [], invites: [] }} isDemoMode={true} />
    </DashboardLayout>
  )
}
