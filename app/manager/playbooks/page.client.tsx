"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Plus, Edit2, Archive, Users, Copy, BarChart3, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import type { ManagerWorkspaceData } from "@/lib/data/workspace-types"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"

function PlaybooksPageInner({ initialData, isDemoMode }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const [activeTab, setActiveTab] = useState("published")
  const { toast } = useToast()
  const router = useRouter()
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedPlaybook, setSelectedPlaybook] = useState<any>(null)
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([])
  const [isSavingAssignments, setIsSavingAssignments] = useState(false)

  const data = initialData

  const activePlaybooks = data.playbooks
  const filteredPlaybooks = activePlaybooks.filter(p => p.status === activeTab)

  const handleAction = (action: string, playbook: any) => {
    if (!isDemoMode) {
      void (async () => {
        if (action === "Duplicate") {
          const response = await fetch(`/api/live/manager/playbooks/${playbook.slug}`, {
            method: "POST",
          })
          const payload = await response.json().catch(() => null)

          if (!response.ok) {
            toast({
              title: "Unable to duplicate playbook",
              description: payload?.error ?? "Please try again.",
              variant: "destructive",
            })
            return
          }

          router.refresh()
          router.push(`/manager/playbooks/${payload.slug}`)
          return
        }

        const status =
          action === "Archive" ? "archived" : action === "Publish" ? "published" : "draft"

        const response = await fetch(`/api/live/manager/playbooks/${playbook.slug}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "status",
            status,
          }),
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          toast({
            title: `Unable to ${action.toLowerCase()} playbook`,
            description: payload?.error ?? "Please try again.",
            variant: "destructive",
          })
          return
        }

        router.refresh()
        toast({
          title: `${action} successful`,
          description: `${playbook.name} has been ${action.toLowerCase()}ed.`,
          className: "border-border/40 bg-card/95 backdrop-blur-xl shadow-xl rounded-2xl",
        })
      })()
      return
    }

    toast({
      title: `${action} successful`,
      description: `${playbook.name} has been ${action.toLowerCase()}ed.`,
      className: "border-border/40 bg-card/95 backdrop-blur-xl shadow-xl rounded-2xl",
    })
  }

  const openAssignModal = (playbook: any) => {
    setSelectedPlaybook(playbook)
    const assignedIds = data.reps
      .filter((rep) => rep.playbooks.includes(playbook.name))
      .map((rep) => rep.id)
    setSelectedRepIds(assignedIds)
    setAssignModalOpen(true)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 font-sans max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 md:mb-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                Playbook Library
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Playbooks</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Create and manage call scoring playbooks
            </p>
          </div>
          <Link href="/manager/playbooks/new">
            <Button className="gap-2 rounded-xl bg-lime px-6 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all h-11">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Playbook</span>
            </Button>
          </Link>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-8 bg-surface/30 border border-border/40 p-1.5 rounded-2xl">
          <TabsTrigger value="published" className="rounded-xl data-[state=active]:bg-lime/20 data-[state=active]:text-lime data-[state=active]:shadow-none transition-all px-6 py-2.5 text-sm font-medium">Published</TabsTrigger>
          <TabsTrigger value="draft" className="rounded-xl data-[state=active]:bg-lime/20 data-[state=active]:text-lime data-[state=active]:shadow-none transition-all px-6 py-2.5 text-sm font-medium">Drafts</TabsTrigger>
          <TabsTrigger value="archived" className="rounded-xl data-[state=active]:bg-lime/20 data-[state=active]:text-lime data-[state=active]:shadow-none transition-all px-6 py-2.5 text-sm font-medium">Archived</TabsTrigger>
        </TabsList>

        <div className="space-y-4">
          {filteredPlaybooks.length === 0 ? (
            <div className="text-center py-24 rounded-3xl border border-dashed border-border/40 bg-surface/30 backdrop-blur-sm flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                <BarChart3 className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground/90">No playbooks found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">You haven't created any playbooks in this category yet.</p>
            </div>
          ) : (
            filteredPlaybooks.map((playbook) => (
              <div key={playbook.id} className="group flex flex-col md:flex-row md:items-center justify-between rounded-3xl bg-card/40 backdrop-blur-xl border border-border/40 p-5 shadow-sm hover:border-lime/40 transition-all duration-300 gap-4">

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-lg text-foreground/90 group-hover:text-lime transition-colors">{playbook.name}</h3>
                    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono rounded-md border ${playbook.status === "published" ? "bg-lime/10 border-lime/20 text-lime" : playbook.status === "draft" ? "bg-orange-500/10 border-orange-500/20 text-orange-400" : "bg-gray-500/10 border-gray-500/20 text-gray-400"}`}>
                      {playbook.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">{playbook.description}</p>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-6 md:gap-8 px-6 py-3 bg-surface/30 rounded-2xl border border-border/40 shrink-0">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Usage</span>
                    <span className="font-mono text-sm text-foreground/90 mt-1">{playbook.calls}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Avg Score</span>
                    <span className="font-mono text-sm text-lime mt-1">{playbook.adherence}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reps</span>
                    <span className="font-mono text-sm text-foreground/90 mt-1">{playbook.reps}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground hidden lg:block">
                    Updated {playbook.updated}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl hover:bg-surface/50 border border-transparent hover:border-border/40 transition-all">
                        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 rounded-2xl border-border/40 bg-card/95 backdrop-blur-xl p-2 shadow-xl">
                      <DropdownMenuItem
                        onClick={() => router.push(`/manager/playbooks/${playbook.slug}`)}
                        className="cursor-pointer focus:bg-surface/50 focus:text-foreground transition-colors rounded-xl p-3 text-sm font-medium text-foreground/90"
                      >
                        <Edit2 className="mr-3 h-4 w-4 text-muted-foreground" /> Edit Rubric
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAssignModal(playbook)} className="cursor-pointer focus:bg-surface/50 focus:text-foreground transition-colors rounded-xl p-3 text-sm font-medium text-foreground/90">
                        <Users className="mr-3 h-4 w-4 text-muted-foreground" /> Assign Reps
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction("Duplicate", playbook)} className="cursor-pointer focus:bg-surface/50 focus:text-foreground transition-colors rounded-xl p-3 text-sm font-medium text-foreground/90">
                        <Copy className="mr-3 h-4 w-4 text-muted-foreground" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border/40 mx-2 my-1" />
                      <DropdownMenuItem onClick={() => handleAction(playbook.status === "published" ? "Unpublish" : "Publish", playbook)} className="cursor-pointer focus:bg-surface/50 focus:text-foreground transition-colors rounded-xl p-3 text-sm font-medium text-foreground/90">
                        <Archive className="mr-3 h-4 w-4 text-muted-foreground" /> {playbook.status === "published" ? "Unpublish" : "Publish"}
                      </DropdownMenuItem>
                      {playbook.status !== "archived" && (
                        <DropdownMenuItem onClick={() => handleAction("Archive", playbook)} className="cursor-pointer focus:bg-destructive/10 text-destructive focus:text-destructive transition-colors rounded-xl p-3 text-sm font-medium">
                          <Archive className="mr-3 h-4 w-4" /> Archive
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

              </div>
            ))
          )}
        </div>
      </Tabs>

      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl border-border/40 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Assign Reps</DialogTitle>
            <DialogDescription>
              Select which reps should be evaluated using the {selectedPlaybook?.name} playbook.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4 max-h-[300px] overflow-y-auto pr-2">
            {data.reps
              .filter((rep) => rep.role === "Sales Rep")
              .map((rep) => {
                const isSelected = selectedRepIds.includes(rep.id);
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() =>
                      setSelectedRepIds((current) =>
                        isSelected ? current.filter((id) => id !== rep.id) : [...current, rep.id]
                      )
                    }
                    className={`flex w-full items-center justify-between p-3.5 rounded-2xl border transition-all text-left group ${
                      isSelected
                        ? "border-lime/50 bg-lime/5 shadow-[0_0_15px_rgba(163,230,53,0.05)]"
                        : "border-border/40 bg-surface/30 hover:bg-surface/50 hover:border-border/60"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className={`text-sm font-semibold transition-colors ${isSelected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"}`}>{rep.name}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">{rep.email}</span>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                      isSelected
                        ? "border-lime bg-lime text-lime-950"
                        : "border-border/50 bg-transparent group-hover:border-border/80"
                    }`}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModalOpen(false)} className="rounded-xl border-border/50 bg-background/50 hover:bg-surface/50">Cancel</Button>
            <Button
              disabled={isSavingAssignments}
              onClick={() => {
                if (!selectedPlaybook || isSavingAssignments) return

                if (!isDemoMode) {
                  void (async () => {
                    setIsSavingAssignments(true)
                    try {
                      const response = await fetch(`/api/live/manager/playbooks/${selectedPlaybook.slug}`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          action: "assignments",
                          userIds: selectedRepIds,
                        }),
                      })

                      const payload = await response.json().catch(() => null)
                      if (!response.ok) {
                        toast({
                          title: "Unable to save assignments",
                          description: payload?.error ?? "Please try again.",
                          variant: "destructive",
                        })
                        return
                      }

                      setAssignModalOpen(false)
                      router.refresh()
                      toast({
                        title: "Reps Assigned",
                        description: "Playbook assignments updated successfully.",
                        className: "border-border/40 bg-card/95 backdrop-blur-xl shadow-xl rounded-2xl",
                      })
                    } finally {
                      setIsSavingAssignments(false)
                    }
                  })()
                  return
                }

                setAssignModalOpen(false)
                toast({
                  title: "Reps Assigned",
                  description: "Playbook assignments updated successfully.",
                  className: "border-border/40 bg-card/95 backdrop-blur-xl shadow-xl rounded-2xl",
                })
              }}
              className="rounded-xl bg-lime hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all"
            >
              {isSavingAssignments ? "Saving..." : "Save Assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function PlaybooksPageClient({ initialData }: { initialData: ManagerWorkspaceData; isDemoMode: boolean }) {
  const { isDemoMode } = useDemo()
  const { data } = useDemoLiveResource({
    demoData: getDemoManagerWorkspaceData(),
    liveUrl: "/api/live/manager",
    emptyData: initialData,
  })
  return (
    <DashboardLayout>
      <PlaybooksPageInner initialData={data} isDemoMode={isDemoMode} />
    </DashboardLayout>
  )
}

export default function PlaybooksPage() {
  return (
    <DashboardLayout>
      <PlaybooksPageInner initialData={{ viewer: null, calls: [], playbooks: [], reps: [], invites: [] }} isDemoMode={true} />
    </DashboardLayout>
  )
}
