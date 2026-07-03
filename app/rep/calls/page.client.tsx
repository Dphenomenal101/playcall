"use client"

import Link from "next/link"
import { RepDashboardLayout } from "@/components/dashboard/rep-dashboard-layout"
import { Button } from "@/components/ui/button"
import { PhoneCall } from "lucide-react"
import { capitalizeFirst } from "@/lib/utils"
import type { RepWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoRepWorkspaceData } from "@/lib/data/demo-workspace"

export function RepCallsPageClient({ initialData }: { initialData: RepWorkspaceData; isDemoMode: boolean }) {
  const { isDemoMode } = useDemo()
  const { data } = useDemoLiveResource({
    demoData: getDemoRepWorkspaceData(),
    liveUrl: "/api/live/rep",
    emptyData: initialData,
  })
  const activeCalls = data.calls

  return (
    <RepDashboardLayout>
      <div className="p-4 md:p-6 lg:p-10 font-sans">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
              <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">My Calls</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">Call history and scorecards</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Review submitted calls, open scorecards, and track what changed after each conversation.
            </p>
          </div>
          <Link href="/rep/upload">
            <Button className="rounded-xl bg-lime py-6 px-6 text-sm font-semibold text-lime-950 shadow-[0_4px_14px_0_rgba(163,230,53,0.39)] transition-all hover:-translate-y-[1px] hover:bg-lime/90 hover:shadow-[0_6px_20px_rgba(163,230,53,0.23)]">
              Upload Call
            </Button>
          </Link>
        </div>

        <div className="grid gap-5">
          {activeCalls.length > 0 ? (
            activeCalls.map((call) => {
              const needsLogging = !call.dealStageAfter

              return (
                <Link key={call.id} href={`/rep/calls/${call.id}`} className="group relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-7 shadow-sm backdrop-blur-xl transition-all hover:bg-card/50 hover:border-lime/30 md:flex-row md:items-center md:justify-between">
                  <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-lime/5 blur-3xl transition-all group-hover:bg-lime/10" />

                  <div className="relative space-y-4">
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
                      <h2 className="text-2xl font-semibold tracking-tight text-foreground transition-colors group-hover:text-lime">{call.company}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground/80">{call.accountContext.contact.name}</span> <span className="text-border">·</span> {call.accountContext.contact.title}
                      </p>
                    </div>
                  </div>

                  <div className="relative grid min-w-[320px] gap-3 sm:grid-cols-3">
                    <div className="flex flex-col justify-between rounded-2xl border border-border/40 bg-surface/30 p-4 transition-colors group-hover:bg-surface/50">
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Overall</p>
                      <div className="mt-2 flex items-baseline gap-1">
                        <p className="text-3xl font-light tracking-tight text-lime">{call.score}</p>
                        <span className="text-xs font-medium text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <div className="flex flex-col justify-between rounded-2xl border border-border/40 bg-surface/30 p-4 transition-colors group-hover:bg-surface/50">
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Adherence</p>
                      <div className="mt-2 flex items-baseline gap-1">
                        <p className="text-3xl font-light tracking-tight text-lime">{call.adherence}</p>
                        <span className="text-xs font-medium text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors ${needsLogging ? "border-amber-500/30 bg-amber-500/10" : "border-border/40 bg-surface/30 group-hover:bg-surface/50"}`}>
                      <p className={`text-[10px] font-mono uppercase tracking-[0.15em] ${needsLogging ? "text-amber-500" : "text-muted-foreground"}`}>Outcome</p>
                      <p className={`mt-2 text-[13px] font-medium leading-tight ${needsLogging ? "text-amber-500" : "text-foreground/90"}`}>
                        {call.dealStageAfter ? capitalizeFirst(call.outcome) : "Needs logging"}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                <PhoneCall className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground/90">No calls scored yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">Upload a recording to get your first AI scorecard and begin coaching.</p>
            </div>
          )}
        </div>
      </div>
    </RepDashboardLayout>
  )
}
