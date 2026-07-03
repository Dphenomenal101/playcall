"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Input } from "@/components/ui/input"
import { Search, ChevronDown } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { capitalizeFirst } from "@/lib/utils"
import { CALL_TYPES, DEAL_STAGES, OUTCOMES, normalizeFilterValue } from "@/lib/playcall-data"
import type { ManagerWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"

const DATE_RANGES: Array<{ value: string; label: string }> = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last quarter" },
  { value: "365", label: "This year" },
  { value: "all", label: "All time" },
]

const ALL_VALUE = "all"

function CallsPageInner({ initialData }: { initialData: ManagerWorkspaceData }) {
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState(ALL_VALUE)
  const [repFilter, setRepFilter] = useState(ALL_VALUE)
  const [playbookFilter, setPlaybookFilter] = useState(ALL_VALUE)
  const [callTypeFilter, setCallTypeFilter] = useState(ALL_VALUE)
  const [stageFilter, setStageFilter] = useState(ALL_VALUE)
  const [outcomeFilter, setOutcomeFilter] = useState(ALL_VALUE)
  const router = useRouter()

  const data = initialData

  const activeCalls = data.calls

  const repOptions = [
    { value: ALL_VALUE, label: "All reps" },
    ...Array.from(new Set(activeCalls.map((call) => call.rep))).map((name) => ({ value: name, label: name })),
  ]
  const playbookOptions = [
    { value: ALL_VALUE, label: "All playbooks" },
    ...Array.from(new Set(activeCalls.map((call) => call.playbook))).map((name) => ({ value: name, label: name })),
  ]
  const callTypeOptions = [{ value: ALL_VALUE, label: "All call types" }, ...CALL_TYPES]
  const stageOptions = [{ value: ALL_VALUE, label: "All stages" }, ...DEAL_STAGES]
  const outcomeOptions = [{ value: ALL_VALUE, label: "All outcomes" }, ...OUTCOMES]

  const filterDefs = [
    { key: "date", label: "Date", value: dateRange, setValue: setDateRange, options: DATE_RANGES },
    { key: "rep", label: "Rep", value: repFilter, setValue: setRepFilter, options: repOptions },
    { key: "playbook", label: "Playbook", value: playbookFilter, setValue: setPlaybookFilter, options: playbookOptions },
    { key: "callType", label: "Call type", value: callTypeFilter, setValue: setCallTypeFilter, options: callTypeOptions },
    { key: "stage", label: "Deal stage", value: stageFilter, setValue: setStageFilter, options: stageOptions },
    { key: "outcome", label: "Outcome", value: outcomeFilter, setValue: setOutcomeFilter, options: outcomeOptions },
  ]

  const filteredCalls = activeCalls.filter((call) => {
    const matchesSearch =
      call.rep.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.playbook.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.company.toLowerCase().includes(searchTerm.toLowerCase())

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

    return matchesSearch && matchesDate && matchesRep && matchesPlaybook && matchesCallType && matchesStage && matchesOutcome
  })

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
              Review Queue
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Scored Calls</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Review scored calls, outcomes, and playbook adherence
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 flex flex-col lg:flex-row gap-4 lg:items-center">
        <div className="relative w-full lg:w-72 xl:w-80 shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            placeholder="Search rep, company, or playbook..."
            className="pl-11 h-12 rounded-2xl bg-surface/30 border border-border/40 backdrop-blur-xl focus-visible:ring-lime/30 focus-visible:border-lime/50 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-1">
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
      </div>

      {/* Calls Table */}
      <div className="rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface/30 border-b border-border/40">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Rep</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Company</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Playbook</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Call Type</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Overall</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Adherence</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Outcome</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground/80">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredCalls.length > 0 ? (
                filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    className="hover:bg-surface/50 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/manager/calls/${call.id}`)}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-foreground/90">{call.rep}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{call.company}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{call.playbook}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{capitalizeFirst(call.callType)}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono bg-lime/10 text-lime px-2 py-1 rounded-md">{call.score}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{call.adherence}%</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground capitalize">{call.outcome}</td>
                    <td className="px-6 py-4 text-[11px] uppercase tracking-wider text-muted-foreground">{call.date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                        <Search className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm font-semibold text-foreground/90">No calls found</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">There are no scored calls matching your current filters, or no calls have been submitted yet.</p>
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

export function CallsPageClient({ initialData }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const { data } = useDemoLiveResource({
    demoData: getDemoManagerWorkspaceData(),
    liveUrl: "/api/live/manager",
    emptyData: initialData,
  })
  return (
    <DashboardLayout>
      <CallsPageInner initialData={data} />
    </DashboardLayout>
  )
}

export default function CallsPage() {
  return (
    <DashboardLayout>
      <CallsPageInner initialData={{ viewer: null, calls: [], playbooks: [], reps: [], invites: [] }} />
    </DashboardLayout>
  )
}
