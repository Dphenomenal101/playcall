"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PlaybookRecord, RepAssignment } from "@/lib/playcall-data"

const getPhasePercentage = (phase?: string) => {
  switch (phase) {
    case "idle": return 0;
    case "uploading": return 15;
    case "ingesting_sources": return 40;
    case "waiting_for_rubric": return 65;
    case "generating_rubric": return 85;
    case "ready": return 100;
    case "failed": return 0;
    default: return 0;
  }
}

function PlaybookDetailPageInner({ initialPlaybook, initialReps, isDemoMode }: { initialPlaybook: PlaybookRecord | null; initialReps: RepAssignment[]; isDemoMode: boolean }) {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const playbook = initialPlaybook
  const [categories, setCategories] = useState(playbook?.categories ?? [])
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [assignedRepIds, setAssignedRepIds] = useState<string[]>([])
  const [isSavingRubric, setIsSavingRubric] = useState(false)
  const [isSavingAssignments, setIsSavingAssignments] = useState(false)

  useEffect(() => {
    if (!playbook) {
      return
    }

    setCategories(playbook.categories)
    setAssignedRepIds(
      initialReps
        .filter((rep) => rep.role === "Sales Rep" && rep.playbooks.includes(playbook.name))
        .map((rep) => rep.id)
    )
  }, [initialReps, playbook])

  useEffect(() => {
    if (isDemoMode || !playbook || (playbook.processingStatus !== "queued" && playbook.processingStatus !== "processing")) {
      return
    }

    const interval = window.setInterval(() => {
      router.refresh()
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [isDemoMode, playbook, router])

  const salesReps = initialReps.filter((rep) => rep.role === "Sales Rep")
  const hasRubric = categories.length > 0
  const hasSourceDocuments = playbook?.sourceDocuments.length ? playbook.sourceDocuments.length > 0 : false
  const isRubricFailed = playbook?.processingStatus === "failed" && Boolean(playbook.processingError)
  const isRubricProcessing = playbook?.processingStatus === "queued" || playbook?.processingStatus === "processing"

  if (!playbook) {
    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-3xl border border-border/40 bg-card/40 p-8 backdrop-blur-xl shadow-sm">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Playbook Not Found
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                This playbook could not be loaded.
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The playbook may have been deleted, or your session may not have access to it.
              </p>
              <div className="mt-6">
                <Button
                  onClick={() => router.push("/manager/playbooks")}
                  variant="outline"
                  className="rounded-xl border-border/50 bg-background/50 hover:bg-surface/50"
                >
                  Back To Playbooks
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const hasRubricChanges = JSON.stringify(categories) !== JSON.stringify(playbook.categories)
  const initialAssignedRepIds = initialReps
    .filter((rep) => rep.role === "Sales Rep" && rep.playbooks.includes(playbook.name))
    .map((rep) => rep.id)
    .sort()
  const hasAssignmentChanges = JSON.stringify([...assignedRepIds].sort()) !== JSON.stringify(initialAssignedRepIds)

  const persistPlaybookAction = async (
    input: Record<string, unknown>,
    successTitle: string,
    successDescription: string
  ) => {
    const response = await fetch(`/api/live/manager/playbooks/${playbook.slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error ?? "Unable to update playbook")
    }

    router.refresh()
    toast({
      title: successTitle,
      description: successDescription,
      className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
    })
  }

  const handleStatusAction = (status: "draft" | "published" | "archived") => {
    if (isDemoMode) {
      toast({
        title: "Playbook updated",
        description: `${playbook.name} is now ${status}.`,
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
      return
    }

    void persistPlaybookAction(
      { action: "status", status },
      "Playbook updated",
      `${playbook.name} is now ${status}.`
    ).catch((error) => {
      toast({
        title: "Unable to update playbook",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    })
  }

  const handleDuplicate = () => {
    if (isDemoMode) {
      toast({
        title: "Playbook duplicated",
        description: `${playbook.name} copy created.`,
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
      return
    }

    void (async () => {
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
    })()
  }

  const handleCategoryChange = (categoryIndex: number, field: "name" | "weight", value: string) => {
    setCategories((current) =>
      current.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              [field]: field === "weight" ? Number(value.replace(/[^0-9.]/g, "")) || 0 : value,
            }
          : category
      )
    )
  }

  const handleCriterionChange = (categoryIndex: number, criterionIndex: number, value: string) => {
    setCategories((current) =>
      current.map((category, index) =>
        index === categoryIndex
          ? {
              ...category,
              criteria: category.criteria.map((criterion, innerIndex) =>
                innerIndex === criterionIndex ? value : criterion
              ),
            }
          : category
      )
    )
  }

  const removeCategory = (categoryIndex: number) => {
    setCategories((current) => current.filter((_, index) => index !== categoryIndex))
  }

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((current) =>
      current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]
    )
  }

  const saveRubric = () => {
    if (isDemoMode) {
      toast({
        title: "Rubric saved",
        description: "Category and criteria edits were stored.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
      return
    }

    void (async () => {
      setIsSavingRubric(true)
      try {
        await persistPlaybookAction(
          { action: "rubric", categories },
          "Rubric saved",
          "Category and criteria edits were stored."
        )
      } catch (error) {
        toast({
          title: "Unable to save rubric",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsSavingRubric(false)
      }
    })()
  }

  const saveAssignments = () => {
    if (isDemoMode) {
      toast({
        title: "Assignments saved",
        description: "Rep coverage for this playbook was updated.",
        className: "bg-lime/10 border-lime/20 text-lime-950 dark:text-lime",
      })
      return
    }

    void (async () => {
      setIsSavingAssignments(true)
      try {
        await persistPlaybookAction(
          { action: "assignments", userIds: assignedRepIds },
          "Assignments saved",
          "Rep coverage for this playbook was updated."
        )
      } catch (error) {
        toast({
          title: "Unable to save assignments",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsSavingAssignments(false)
      }
    })()
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-4">
                <Link href="/manager/playbooks" className="group inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  All Playbooks
                </Link>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">{playbook.name}</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{playbook.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => handleStatusAction(playbook.status === "published" ? "draft" : "published")}
                className="rounded-xl bg-lime px-6 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all"
              >
                {playbook.status === "published" ? "Unpublish" : "Publish"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:bg-surface/50 h-10 w-10">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/80"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl p-1.5 shadow-lg border-border/40">
                  <DropdownMenuItem onClick={handleDuplicate} className="rounded-lg cursor-pointer py-2.5 font-medium text-foreground/80 hover:text-foreground">
                    <svg className="w-4 h-4 mr-2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Duplicate Playbook
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStatusAction("archived")} className="rounded-lg cursor-pointer py-2.5 font-medium text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 dark:text-rose-400">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    Archive Playbook
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
            <div className="space-y-16">
              {isRubricFailed ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
                  <h2 className="text-sm font-semibold text-rose-400">Generation Failed</h2>
                  <p className="mt-1 text-sm text-rose-400/80">{playbook.processingError}</p>
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between border-b border-border/10 pb-4">
                  <h2 className="text-xl font-medium tracking-tight text-foreground/90">Rubric Configuration</h2>
                  <Button
                    onClick={saveRubric}
                    disabled={isSavingRubric || !hasRubric || !hasRubricChanges}
                    variant="default"
                    className={`h-8 rounded-full px-5 text-xs transition-all ${
                      hasRubricChanges
                        ? "bg-lime text-lime-950 hover:bg-lime/90 font-semibold shadow-sm"
                        : "bg-surface/50 text-muted-foreground/50 hover:bg-surface/50 cursor-default"
                    }`}
                  >
                    {isSavingRubric ? "Saving..." : "Save changes"}
                  </Button>
                </div>

                  <div className="mt-4 space-y-1">
                    {hasRubric ? (
                      categories.map((category, categoryIndex) => {
                        const isExpanded = expandedCategories.includes(category.id);
                        return (
                        <div key={category.id} className="group relative border-b border-border/10 last:border-b-0 py-5 transition-all">
                          <div className="flex items-center justify-between gap-6">
                            <div className="flex-1 flex items-center gap-3">
                              <div className="w-1 h-6 bg-lime rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                              <input
                                className="w-full bg-transparent text-lg font-medium tracking-tight text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-0 transition-colors"
                                value={category.name}
                                placeholder="Category Name"
                                onChange={(event) => handleCategoryChange(categoryIndex, "name", event.target.value)}
                              />
                            </div>
                            <div className="w-16 text-right">
                              <div className="flex items-center justify-end gap-1 text-muted-foreground focus-within:text-foreground transition-colors">
                                <input
                                  className="w-full bg-transparent text-lg font-light tracking-tight text-right focus:outline-none focus:ring-0"
                                  value={`${category.weight}`}
                                  onChange={(event) => handleCategoryChange(categoryIndex, "weight", event.target.value)}
                                />
                                <span className="text-sm">%</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button onClick={() => toggleCategory(category.id)} variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-surface/50 rounded-full transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                              </Button>
                              <Button onClick={() => removeCategory(categoryIndex)} variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10 rounded-full transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </Button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 space-y-2 pl-4">
                            {category.criteria.map((criterion, criterionIndex) => (
                              <div key={`${category.id}-${criterionIndex}`} className="flex items-start gap-3">
                                <div className="mt-2.5 h-1 w-1 rounded-full bg-lime/40 shrink-0" />
                                <input
                                  className="w-full bg-transparent py-1 text-sm text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-0 transition-colors"
                                  value={criterion}
                                  placeholder="Enter scoring criteria..."
                                  onChange={(event) => handleCriterionChange(categoryIndex, criterionIndex, event.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      )
                    })
                  ) : isRubricProcessing ? (
                    <div className="rounded-2xl border border-border/10 bg-surface/10 p-12 flex flex-col items-center justify-center text-center">
                      <div className="relative w-12 h-12 mb-6">
                        <div className="absolute inset-0 rounded-full border-2 border-lime/10"></div>
                        <div className="absolute inset-0 rounded-full border-2 border-lime border-t-transparent animate-spin"></div>
                      </div>
                      <h3 className="text-base font-medium text-foreground">{playbook.processingProgress?.title || "Generating Rubric..."}</h3>
                      <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                        {playbook.processingProgress?.detail || "Analyzing source documents and configuring scoring criteria..."}
                      </p>

                      <div className="w-full max-w-xs mt-8 space-y-2">
                        <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          <span>Progress</span>
                          <span>{getPhasePercentage(playbook.processingProgress?.phase)}%</span>
                        </div>
                        <div className="h-1 w-full bg-surface/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-lime rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${getPhasePercentage(playbook.processingProgress?.phase)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/10 p-12 text-center">
                      <p className="text-sm font-medium text-foreground/80">
                        {isRubricFailed ? "No generated rubric is available." : "No generated rubric yet."}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground max-w-md mx-auto">
                        {isRubricFailed
                          ? "The last generation run failed. Update the rubric directly or duplicate this playbook to retry with a fresh setup."
                          : "No rubric has been generated yet. Duplicate this playbook if you want a fresh generation flow."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-medium tracking-tight text-foreground/90 border-b border-border/10 pb-4">Source Documents</h2>
                <div className="mt-6 space-y-3">
                  {hasSourceDocuments ? (
                    playbook.sourceDocuments.map((source) => (
                      <div key={source.id} className="group flex items-center justify-between gap-4 rounded-xl border border-border/10 bg-surface/10 p-4 hover:bg-surface/20 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <svg className="w-5 h-5 text-muted-foreground/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                          <p className="font-medium text-sm text-foreground/80 leading-tight group-hover:text-foreground transition-colors truncate" title={source.name}>{source.name}</p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <p className="text-xs text-muted-foreground hidden sm:block">{source.updatedAt}</p>
                          <span className="px-2 py-1 rounded-md bg-lime/10 text-[10px] uppercase tracking-wider font-semibold text-lime">{source.status}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/10 p-8 text-center">
                      <p className="text-sm text-muted-foreground">No source documents attached.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-12 rounded-3xl border border-border/20 bg-surface/20 dark:bg-card/40 dark:border-border/30 dark:shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-6 md:p-8 shadow-sm h-fit backdrop-blur-sm">
              <div>
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performance</h2>
                <div className="mt-6">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-5xl font-light tracking-tight text-lime">{playbook.calls > 0 ? `${playbook.adherence}%` : "0%"}</span>
                  </div>
                  <div className="h-1 w-full bg-surface/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-lime rounded-full transition-all duration-1000"
                      style={{ width: `${playbook.calls > 0 ? playbook.adherence : 0}%` }}
                    />
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                    {playbook.calls > 0 ? `Average adherence across ${playbook.calls} scored calls.` : "No scored calls yet."}
                  </p>
                  <div className="mt-6">
                    <Link href="/manager/leaderboard">
                      <Button variant="outline" className="w-full h-8 rounded-full border-border/20 bg-transparent text-xs hover:bg-surface/30 transition-all text-muted-foreground hover:text-foreground">
                        View leaderboard
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Overview</h2>
                <div className="mt-6 space-y-6">
                  <div>
                    <p className="text-sm font-medium capitalize text-foreground/90">{playbook.status}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Status</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/90">{playbook.updated}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Last updated</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/90">{playbook.calls} calls</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Total volume</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between border-b border-border/10 pb-4">
                  <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Coverage</h2>
                  <Button
                    onClick={saveAssignments}
                    disabled={isSavingAssignments || salesReps.length === 0 || !hasAssignmentChanges}
                    variant="default"
                    className={`h-7 px-3 text-[10px] uppercase rounded-full transition-all ${
                      hasAssignmentChanges
                        ? "bg-lime text-lime-950 hover:bg-lime/90 font-semibold shadow-sm"
                        : "bg-surface/50 text-muted-foreground/50 hover:bg-surface/50 cursor-default"
                    }`}
                  >
                    {isSavingAssignments ? "Saving..." : "Save"}
                  </Button>
                </div>
                <div className="mt-4 space-y-1">
                  {salesReps.length > 0 ? (
                    salesReps.map((rep) => {
                      const assigned = assignedRepIds.includes(rep.id)
                      return (
                        <label key={rep.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface/20 cursor-pointer transition-all group">
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${assigned ? 'bg-lime text-lime-950' : 'bg-surface/50 text-muted-foreground group-hover:bg-surface/80 group-hover:text-foreground/80'}`}>
                              {rep.name.charAt(0)}
                            </div>
                            <span className={`text-sm transition-colors ${assigned ? "text-foreground/90 font-medium" : "text-muted-foreground group-hover:text-foreground/80"}`}>{rep.name}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={assigned}
                            onChange={(event) =>
                              setAssignedRepIds((current) =>
                                event.target.checked ? [...current, rep.id] : current.filter((id) => id !== rep.id)
                              )
                            }
                            className="sr-only"
                          />
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${assigned ? 'border-lime bg-lime text-lime-950' : 'border-border/30 bg-transparent group-hover:border-border/50'}`}>
                            {assigned && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                          </div>
                        </label>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground p-3">No reps available.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export function PlaybookDetailPageClient({ initialPlaybook, initialReps, isDemoMode }: { initialPlaybook: PlaybookRecord | null; initialReps: RepAssignment[]; isDemoMode: boolean }) {
  return <PlaybookDetailPageInner initialPlaybook={initialPlaybook} initialReps={initialReps} isDemoMode={isDemoMode} />
}

export default function PlaybookDetailPage() {
  return <PlaybookDetailPageInner initialPlaybook={null} initialReps={[]} isDemoMode={true} />
}
