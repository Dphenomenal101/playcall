"use client"

import { useState } from "react"
import Link from "next/link"
import { RepDashboardLayout } from "@/components/dashboard/rep-dashboard-layout"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookCopy, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import type { RepWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoRepWorkspaceData } from "@/lib/data/demo-workspace"

function formatCallTypeLabel(callType: string) {
  return callType
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function PlaybookCard({ playbook }: { playbook: any }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isPublished = playbook.status.toLowerCase() === "published"

  const statusTone = isPublished
    ? "border-lime/20 bg-lime/10 text-lime"
    : "border-border/40 bg-surface/30 text-muted-foreground"

  return (
    <div className={cn(
      "group relative flex flex-col overflow-hidden rounded-3xl border p-8 shadow-sm backdrop-blur-xl transition-all duration-500",
      isPublished ? "border-border/40 bg-card/40 hover:bg-card/50" : "border-border/20 bg-card/20 opacity-80 grayscale-[0.2]"
    )}>
      {isPublished && (
        <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-foreground/5 blur-3xl transition-all group-hover:bg-foreground/10" />
      )}

      <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{playbook.segment}</span>
            <div className="h-1 w-1 rounded-full bg-border/60" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{playbook.methodology}</span>
          </div>
          <h2 className={cn("mt-3 text-2xl font-semibold tracking-tight", isPublished ? "text-foreground" : "text-foreground/70")}>{playbook.name}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-2xl">{playbook.description}</p>
        </div>
        <span className={cn("shrink-0 self-start rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider", statusTone)}>
          {playbook.status}
        </span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
           <span className="font-semibold text-foreground/80">Call types:</span>
           <div className="flex flex-wrap gap-2">
             {playbook.callTypes.map((ct: string) => (
               <span key={ct} className={cn("rounded-md border border-border/50 px-2 py-0.5 backdrop-blur-sm", isPublished ? "bg-surface/30 text-foreground/90" : "bg-transparent text-muted-foreground")}>{formatCallTypeLabel(ct)}</span>
             ))}
           </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-border/40 pt-6">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group/btn flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface/50 hover:text-foreground -ml-4"
        >
          View Scoring Rubric
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", isExpanded && "rotate-180")} />
        </button>
        {isPublished ? (
          <Link href="/rep/upload" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto gap-2 rounded-xl border-border/50 bg-surface/30 py-5 px-6 text-sm font-medium transition-all hover:bg-surface/50 hover:text-foreground shadow-sm">
              Upload Call
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Button disabled variant="outline" className="w-full sm:w-auto gap-2 rounded-xl border-border/50 bg-surface/10 py-5 px-6 text-sm font-medium opacity-50">
            Upload Call
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-6 rounded-3xl border border-border/30 bg-black/10 p-6 sm:p-8">
              <div className="grid gap-8 sm:grid-cols-2">
                {playbook.categories.map((category: any) => (
                  <div key={category.id} className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className="shrink-0 text-[10px] font-mono text-muted-foreground">{category.weight}%</span>
                      <p className="text-sm font-semibold text-foreground/90">{category.name}</p>
                    </div>
                    <ul className="mt-3 space-y-2.5">
                      {category.criteria.map((criterion: string) => (
                        <li key={criterion} className="flex items-start gap-3 text-[13px] leading-relaxed text-muted-foreground">
                          <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-border/80" />
                          <span>{criterion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function RepPlaybooksClient({ initialData }: { initialData: RepWorkspaceData; isDemoMode: boolean }) {
  const { isDemoMode } = useDemo()
  const { data, hasLoaded } = useDemoLiveResource({
    demoData: getDemoRepWorkspaceData(),
    liveUrl: "/api/live/rep",
    emptyData: initialData,
  })
  const assigned = data.playbooks

  return (
    <RepDashboardLayout>
      <div className="p-4 md:p-6 lg:p-10 font-sans">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">Assigned playbooks</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            View your assigned playbooks, supported call types, and scoring rubrics.
          </p>
        </div>
        <div className="grid gap-6">
          {!hasLoaded ? (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-lime/30 border-t-lime" />
              <p className="mt-4 text-sm font-semibold text-foreground/90">Loading playbooks...</p>
            </div>
          ) : assigned.length > 0 ? (
            assigned.map((playbook) => (
              <PlaybookCard key={playbook.id} playbook={playbook} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                <BookCopy className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground/90">No assigned playbooks</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">Your manager hasn't assigned any playbooks for you to use yet.</p>
            </div>
          )}
        </div>
      </div>
    </RepDashboardLayout>
  )
}
