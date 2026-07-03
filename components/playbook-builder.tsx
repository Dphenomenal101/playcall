"use client"

import { upload } from "@vercel/blob/client"
import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, File as FileIcon, FileUp, Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BuilderPayload } from "@/lib/data/live-write"
import { CALL_TYPES } from "@/lib/playcall-data"

export type BuilderCompletionResult =
  | { mode: "demo"; payload: BuilderPayload; status: "draft" | "published" }
  | { mode: "live"; playbookId: string; slug: string; status: "draft" | "published" }

export interface PlaybookBuilderInitialData {
  playbookId?: string
  slug?: string
  name: string
  description: string
  segment: string
  methodology: string
  callTypes: string[]
  notes: string
  sourceDocuments?: Array<{
    id: string
    name: string
    type: string
    updatedAt: string
    status: string
    error?: string | null
  }>
}

interface PlaybookBuilderProps {
  mode: "demo" | "live"
  onComplete: (result: BuilderCompletionResult) => void | Promise<void>
  submitLabel?: string
  isSubmitting?: boolean
  initialData?: PlaybookBuilderInitialData
}

type LiveStatus = "idle" | "creating" | "polling" | "ready" | "failed"
type LiveProcessingProgress = {
  phase: "idle" | "uploading" | "ingesting_sources" | "waiting_for_rubric" | "generating_rubric" | "ready" | "failed"
  title: string
  detail: string
  elapsedLabel?: string
  sourceCounts: {
    total: number
    attached: number
    processing: number
    failed: number
  }
}

function buildInitialFormData(initialData?: PlaybookBuilderInitialData) {
  return {
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    segment: initialData?.segment ?? "",
    methodology: initialData?.methodology ?? "",
    // Older playbooks stored these as Title Case ("Negotiation") before the
    // builder and the call-type select were reconciled onto one lowercase
    // value set - normalize on load so existing selections still show as
    // checked, and so re-saving migrates the row to the new format.
    callTypes: (initialData?.callTypes ?? []).map((type) => type.toLowerCase()),
    notes: initialData?.notes ?? "",
  }
}

export function PlaybookBuilder({
  mode,
  onComplete,
  submitLabel = "Publish Playbook",
  isSubmitting = false,
  initialData,
}: PlaybookBuilderProps) {
  const [step, setStep] = useState(1)
  const [rubric, setRubric] = useState<Array<{ id: string; name: string; weight: number; criteria: string[] }>>([])
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [formData, setFormData] = useState(() => buildInitialFormData(initialData))
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: string; type: string; file: File }>>([])
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle")
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveProgress, setLiveProgress] = useState<LiveProcessingProgress | null>(null)
  const [liveSourceDocuments, setLiveSourceDocuments] = useState<PlaybookBuilderInitialData["sourceDocuments"]>(initialData?.sourceDocuments ?? [])
  const [livePlaybook, setLivePlaybook] = useState<{ id: string; slug: string } | null>(
    initialData?.playbookId && initialData.slug ? { id: initialData.playbookId, slug: initialData.slug } : null
  )
  const [isSavingRubric, setIsSavingRubric] = useState(false)
  const [savingTarget, setSavingTarget] = useState<"draft" | "published" | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const existingSourceDocuments = initialData?.sourceDocuments ?? []
  const isLiveReviewLocked = mode === "live" && step === 4 && liveStatus === "ready" && livePlaybook !== null

  useEffect(() => {
    setFormData(buildInitialFormData(initialData))
    setUploadedFiles([])
    setRubric([])
    setStep(1)
    setValidationError(null)
    setIsDraggingFiles(false)
    setLiveStatus("idle")
    setLiveError(null)
    setLiveProgress(null)
    setLiveSourceDocuments(initialData?.sourceDocuments ?? [])
    setLivePlaybook(initialData?.playbookId && initialData.slug ? { id: initialData.playbookId, slug: initialData.slug } : null)
  }, [initialData])

  useEffect(() => {
    if (mode !== "demo" || step !== 3) {
      return
    }

    const timer = setTimeout(() => {
      setRubric([
        { id: "cat-1", name: "Discovery", weight: 20, criteria: ["Identified core business pain", "Asked about implications"] },
        { id: "cat-2", name: "Qualification", weight: 20, criteria: ["Confirmed timeline", "Identified key stakeholders"] },
        { id: "cat-3", name: "Objection Handling", weight: 15, criteria: ["Handled pricing concerns effectively"] },
        { id: "cat-4", name: "Product Accuracy", weight: 15, criteria: ["Positioned the core offering accurately"] },
        { id: "cat-5", name: "Next-Step Clarity", weight: 15, criteria: ["Secured firm date for next call"] },
        { id: "cat-6", name: "Playbook Adherence", weight: 15, criteria: ["Matched the expected sales motion"] },
      ])
      setStep(4)
    }, 3000)

    return () => clearTimeout(timer)
  }, [mode, step])

  useEffect(() => {
    if (mode !== "live" || liveStatus !== "polling" || !livePlaybook) {
      return
    }

    let cancelled = false
    let readyWithoutCategoriesCount = 0
    let failedSightingCount = 0
    const MAX_READY_WITHOUT_CATEGORIES_POLLS = 5 // ~15s at the 3s interval below
    // Job dispatch falls back from the Edge Function to local in-process
    // processing on any error (lib/jobs/dispatch.ts) - if the Edge Function
    // attempt fails, it writes processing_status "failed" before the local
    // fallback even starts retrying, so a poll can catch that intermediate
    // write even though the job goes on to succeed moments later. Don't
    // treat a single "failed" sighting as terminal - only give up if it's
    // still failed after the fallback would plausibly have finished.
    const MAX_FAILED_POLLS_BEFORE_GIVING_UP = 3 // ~9s at the 3s interval below

    const poll = async () => {
      try {
        const response = await fetch(`/api/live/manager/playbooks/${livePlaybook.slug}`)
        const result = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to check playbook status")
        }

        if (cancelled) return

        const playbook = result?.playbook
        setLiveProgress(playbook?.processingProgress ?? null)
        setLiveSourceDocuments(Array.isArray(playbook?.sourceDocuments) ? playbook.sourceDocuments : [])
        if (playbook?.processingStatus === "failed") {
          failedSightingCount += 1
          if (failedSightingCount < MAX_FAILED_POLLS_BEFORE_GIVING_UP) {
            return
          }

          setLiveStatus("failed")
          setLiveError(playbook?.processingError ?? "Rubric generation failed for this playbook. Start over to try again.")
          return
        }

        failedSightingCount = 0

        if (playbook?.processingStatus === "ready") {
          const categories = Array.isArray(playbook.categories) ? playbook.categories : []

          // "ready" can be observed for an instant before the rubric write commits
          // (status flips to ready, then back to processing once generation is
          // scheduled). Don't treat that as terminal on the first sighting -
          // keep polling briefly so a transient empty read can resolve itself.
          if (categories.length === 0) {
            readyWithoutCategoriesCount += 1
            if (readyWithoutCategoriesCount < MAX_READY_WITHOUT_CATEGORIES_POLLS) {
              return
            }
          }

          setRubric(categories)
          setLiveStatus("ready")
          setStep(4)
          return
        }

        readyWithoutCategoriesCount = 0
      } catch (error) {
        if (!cancelled) {
          setLiveStatus("failed")
          setLiveError(error instanceof Error ? error.message : "Unable to check playbook status")
        }
      }
    }

    void poll()
    const interval = window.setInterval(poll, 3000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [livePlaybook, liveStatus, mode])

  const addFiles = (files: File[]) => {
    if (files.length === 0) {
      return
    }

    setValidationError(null)
    setUploadedFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        type: file.type,
        file,
      })),
    ])
  }

  const persistLiveSetupAndPoll = async () => {
    setLiveStatus("creating")
    setLiveError(null)
    setLiveProgress({
      phase: "uploading",
      title: "Uploading source material",
      detail: "Uploading your files and saving this playbook.",
      sourceCounts: {
        total: uploadedFiles.length + (formData.notes.trim() ? 1 : 0),
        attached: 0,
        processing: 0,
        failed: 0,
      },
    })
    setLiveSourceDocuments(
      uploadedFiles.map((file, index) => ({
        id: `pending-${index}`,
        name: file.name,
        type: file.type || "file",
        updatedAt: "Pending",
        status: "processing",
        error: null,
      }))
    )

    try {
      // Upload each file directly to Vercel Blob (bypasses Vercel's 4.5MB
      // Function body limit entirely — only the tiny JSON payload goes through
      // our route handler). Ragie then fetches the files from the public Blob
      // URLs server-to-server, so no large bytes touch our Function at all.
      const blobSources = await Promise.all(
        uploadedFiles.map(async (item) => {
          const result = await upload(item.name, item.file, {
            access: "public",
            handleUploadUrl: "/api/blob-upload",
          })
          return { url: result.url, name: item.name, size: item.file.size, type: item.type }
        })
      )

      const response = await fetch("/api/live/manager/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          segment: formData.segment,
          methodology: formData.methodology,
          callTypes: formData.callTypes,
          notes: formData.notes,
          blobSources,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to create playbook")
      }

      setLivePlaybook({ id: result.playbookId, slug: result.slug })
      setLiveStatus("polling")
    } catch (error) {
      setLiveStatus("failed")
      setLiveError(error instanceof Error ? error.message : "Unable to create playbook")
    }
  }

  const handleStartOver = () => {
    setLiveStatus("idle")
    setLiveError(null)
    setLiveProgress(null)
    setValidationError(null)
    setRubric([])
    setUploadedFiles([])
    setFormData(buildInitialFormData(initialData))
    setLivePlaybook(initialData?.playbookId && initialData.slug ? { id: initialData.playbookId, slug: initialData.slug } : null)
    setStep(1)
  }

  const validateStep = (targetStep: number) => {
    if (targetStep === 2) {
      if (!formData.name.trim()) {
        setValidationError("Playbook name is required.")
        return false
      }

      if (!formData.segment.trim()) {
        setValidationError("Target segment is required.")
        return false
      }

      if (!formData.methodology.trim()) {
        setValidationError("Sales methodology is required.")
        return false
      }

      if (formData.callTypes.length === 0) {
        setValidationError("Select at least one applicable call type.")
        return false
      }
    }

    if (targetStep === 3) {
      if (uploadedFiles.length === 0 && existingSourceDocuments.length === 0 && !formData.notes.trim()) {
        setValidationError("Add notes or upload at least one source file.")
        return false
      }
    }

    setValidationError(null)
    return true
  }

  const handleNext = () => {
    const nextStep = step + 1

    if (!validateStep(nextStep)) {
      return
    }

    if (step === 2) {
      setStep(3)
      if (mode === "live") {
        void persistLiveSetupAndPoll()
      }
      return
    }

    if (step < 4) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  const handleCallTypeToggle = (type: string) => {
    setValidationError(null)
    setFormData((prev) => ({
      ...prev,
      callTypes: prev.callTypes.includes(type)
        ? prev.callTypes.filter((value) => value !== type)
        : [...prev.callTypes, type],
    }))
  }

  const handleWeightChange = (id: string, weightStr: string) => {
    const value = parseInt(weightStr) || 0
    setRubric((prev) => prev.map((category) => (category.id === id ? { ...category, weight: value } : category)))
  }

  const handleCategoryNameChange = (id: string, name: string) => {
    setRubric((prev) => prev.map((category) => (category.id === id ? { ...category, name } : category)))
  }

  const handleCriterionChange = (categoryId: string, index: number, value: string) => {
    setRubric((prev) =>
      prev.map((category) =>
        category.id === categoryId
          ? { ...category, criteria: category.criteria.map((criterion, criterionIndex) => (criterionIndex === index ? value : criterion)) }
          : category
      )
    )
  }

  const handleRemoveCategory = (id: string) => {
    setRubric((prev) => prev.filter((category) => category.id !== id))
  }

  const handleAddCategory = () => {
    setRubric((prev) => [...prev, { id: `cat-${Date.now()}`, name: "New Category", weight: 0, criteria: ["New criteria..."] }])
  }

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    addFiles(files)
    event.target.value = ""
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingFiles(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingFiles(false)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingFiles(false)
    addFiles(Array.from(event.dataTransfer.files ?? []))
  }

  const removeFile = (indexToRemove: number) => {
    setUploadedFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const handleSubmit = async (targetStatus: "draft" | "published" = "published") => {
    if (mode === "live") {
      if (!livePlaybook) return

      setIsSavingRubric(true)
      setSavingTarget(targetStatus)
      setLiveError(null)

      try {
        const response = await fetch(`/api/live/manager/playbooks/${livePlaybook.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rubric", categories: rubric }),
        })

        if (!response.ok) {
          const result = await response.json().catch(() => null)
          throw new Error(result?.error ?? "Unable to save rubric")
        }

        const statusResponse = await fetch(`/api/live/manager/playbooks/${livePlaybook.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", status: targetStatus }),
        })

        if (!statusResponse.ok) {
          const result = await statusResponse.json().catch(() => null)
          throw new Error(result?.error ?? `Unable to ${targetStatus === "published" ? "publish" : "save"} playbook`)
        }

        await onComplete({ mode: "live", playbookId: livePlaybook.id, slug: livePlaybook.slug, status: targetStatus })
      } catch (error) {
        setLiveError(error instanceof Error ? error.message : "Unable to save rubric")
      } finally {
        setIsSavingRubric(false)
        setSavingTarget(null)
      }

      return
    }

    await onComplete({
      mode: "demo",
      status: targetStatus,
      payload: {
        name: formData.name,
        description: formData.description,
        segment: formData.segment,
        methodology: formData.methodology,
        callTypes: formData.callTypes,
        notes: formData.notes,
        categories: rubric,
        uploadedFiles: uploadedFiles.map((item) => ({
          name: item.name,
          size: item.file.size,
          type: item.type,
          file: item.file,
        })),
      },
    })
  }

  const totalWeight = rubric.reduce((sum, category) => sum + category.weight, 0)
  const badgeLabel = "New Playbook"
  const heading = "Playbook Builder"
  const subheading = "Provide context and source material, and let Playcall's AI draft a scoring rubric for you."

  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  }

  return (
    <div className="font-sans w-full">
      <div className="mb-10 max-w-2xl">
        <div className="mb-4 inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
          <div className="mr-2 h-1.5 w-1.5 rounded-full bg-lime/80 shadow-[0_0_8px_rgba(163,230,53,0.8)] pulse-live" />
          <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">{badgeLabel}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">{heading}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{subheading}</p>
      </div>

      <div className="mb-10 grid gap-3 md:grid-cols-4">
        {[
          { step: 1, label: "Details", detail: "Name, segment, and methodology" },
          { step: 2, label: "Source Material", detail: "Upload scripts, notes, or PDFs" },
          { step: 3, label: "AI Processing", detail: "Extracting criteria & weights" },
          { step: 4, label: "Review Rubric", detail: "Edit weights and publish" },
        ].map((item) => {
          const isDone = step > item.step
          const isActive = step === item.step

          return (
            <div
              key={item.step}
              className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-500 ${
                isActive
                  ? "border-lime/40 bg-lime/5 shadow-[0_0_20px_rgba(163,230,53,0.1)]"
                  : isDone
                    ? "border-lime/20 bg-lime/5 opacity-80"
                    : "border-border/30 bg-surface/20 opacity-50"
              }`}
            >
              {isActive ? <div className="absolute -left-6 -top-6 h-16 w-16 rounded-full bg-lime/20 blur-xl" /> : null}
              <div className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <p className={`text-[10px] font-mono uppercase tracking-[0.2em] ${isActive || isDone ? "text-lime" : "text-muted-foreground"}`}>
                    Step {item.step}
                  </p>
                  {isDone ? (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-lime/20">
                      <div className="h-1.5 w-1.5 rounded-full bg-lime" />
                    </div>
                  ) : null}
                </div>
                <p className={`text-sm font-semibold tracking-tight ${isActive || isDone ? "text-foreground" : "text-foreground/70"}`}>{item.label}</p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="relative flex min-h-[600px] max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/40 shadow-sm backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-40 -top-40 h-80 w-80 rounded-full bg-lime/5 blur-3xl" />

        <div className="custom-scrollbar relative flex-1 overflow-y-auto p-6 md:p-10">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step-1"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Playbook Details</h2>
                  <p className="mt-2 text-sm text-muted-foreground">The foundational metadata for this rubric.</p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Playbook Name</label>
                    <Input
                      type="text"
                      placeholder="e.g., Enterprise Discovery"
                      value={formData.name}
                      onChange={(event) => {
                        setValidationError(null)
                        setFormData((prev) => ({ ...prev, name: event.target.value }))
                      }}
                      className="h-12 rounded-xl bg-surface/30 border-border/40 focus:border-lime/50 transition-all text-foreground/80 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description (Optional)</label>
                    <textarea
                      placeholder="Brief overview of what this playbook scores..."
                      value={formData.description}
                      onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                      className="min-h-24 w-full rounded-xl border border-border/40 bg-surface/30 px-4 py-3 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Segment</label>
                    <Select
                      value={formData.segment}
                      onValueChange={(value) => {
                        setValidationError(null)
                        setFormData((prev) => ({ ...prev, segment: value }))
                      }}
                    >
                      <SelectTrigger className="h-12 rounded-xl bg-surface/30 border-border/40 focus:border-lime/50 transition-all text-foreground/80 outline-none">
                        <SelectValue placeholder="Select segment" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                        <SelectItem value="SMB" className="rounded-lg hover:bg-surface/50">SMB</SelectItem>
                        <SelectItem value="Mid-Market" className="rounded-lg hover:bg-surface/50">Mid-Market</SelectItem>
                        <SelectItem value="Enterprise" className="rounded-lg hover:bg-surface/50">Enterprise</SelectItem>
                        <SelectItem value="All" className="rounded-lg hover:bg-surface/50">All Segments</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sales Methodology</label>
                    <Select
                      value={formData.methodology}
                      onValueChange={(value) => {
                        setValidationError(null)
                        setFormData((prev) => ({ ...prev, methodology: value }))
                      }}
                    >
                      <SelectTrigger className="h-12 rounded-xl bg-surface/30 border-border/40 focus:border-lime/50 transition-all text-foreground/80 outline-none">
                        <SelectValue placeholder="Select methodology" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                        <SelectItem value="MEDDICC" className="rounded-lg hover:bg-surface/50">MEDDICC</SelectItem>
                        <SelectItem value="SPICED" className="rounded-lg hover:bg-surface/50">SPICED</SelectItem>
                        <SelectItem value="BANT" className="rounded-lg hover:bg-surface/50">BANT</SelectItem>
                        <SelectItem value="Challenger" className="rounded-lg hover:bg-surface/50">Challenger</SelectItem>
                        <SelectItem value="Custom" className="rounded-lg hover:bg-surface/50">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Applicable Call Types</label>
                    <div className="flex flex-wrap gap-2">
                      {CALL_TYPES.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => handleCallTypeToggle(type.value)}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${formData.callTypes.includes(type.value) ? "bg-lime/20 border-lime/30 text-lime" : "bg-surface/30 border-border/40 text-muted-foreground hover:border-lime/30"}`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {validationError ? <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">{validationError}</div> : null}
              </motion.div>
            ) : null}

            {step === 2 ? (
              <motion.div
                key="step-2"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Upload Source Material</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Provide PDFs, Word docs, Slide decks, or text snippets for Playcall to analyze.</p>
                </div>

                {existingSourceDocuments.length > 0 ? (
                  <div className="rounded-2xl border border-border/40 bg-surface/20 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Existing source material</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Attached documents stay linked to this playbook, but persisted files cannot be repopulated into the uploader. Add files again only when you want to append or retry source material.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {existingSourceDocuments.map((source) => (
                        <div key={source.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card/40 px-4 py-3 text-sm">
                          <div>
                            <p className="font-medium text-foreground/80">{source.name}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{source.type} • {source.updatedAt}</p>
                            {source.error ? <p className="mt-2 text-[11px] text-rose-300">{source.error}</p> : null}
                          </div>
                          <span className="rounded-md border border-lime/20 bg-lime/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-lime">{source.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
                    isDraggingFiles
                      ? "border-lime/50 bg-lime/5"
                      : "border-border/40 bg-surface/10 hover:border-lime/30 hover:bg-surface/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rst,.rtf,.html,.json,.xml,.epub,.odt,.mp3,.wav,.m4a,.ogg,.aac,.flac,.mp4,.mov,.webm,.avi,.mkv,.png,.jpg,.jpeg,.webp,.heic,.tiff"
                    className="hidden"
                    onChange={handleFileSelection}
                  />
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface/50">
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, PPTX, XLSX, TXT, MD, MP3, MP4, MOV, and more</p>
                </div>

                <AnimatePresence>
                  {uploadedFiles.length > 0 ? (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-3">
                      {uploadedFiles.map((file, index) => (
                        <motion.div
                          key={`${file.name}-${index}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface/30 p-2 pr-3 shadow-sm"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background">
                            <FileIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium leading-none">{file.name}</span>
                            <span className="mt-1 text-xs text-muted-foreground">{file.size}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation()
                              removeFile(index)
                            }}
                            className="ml-2 h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Additional notes</label>
                  <textarea
                    placeholder="E.g., 'Ensure the rep asks about budget timeframe, and handles the competitor X objection by highlighting our integration capabilities...'"
                    value={formData.notes}
                    onChange={(event) => {
                      setValidationError(null)
                      setFormData((prev) => ({ ...prev, notes: event.target.value }))
                    }}
                    className="min-h-32 w-full rounded-xl border border-border/40 bg-surface/30 px-4 py-3 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none resize-none"
                  />
                </div>

                {validationError ? <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">{validationError}</div> : null}
              </motion.div>
            ) : null}

            {step === 3 ? (
              <motion.div
                key="step-3"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                {mode === "live" && liveStatus === "failed" ? (
                  <>
                    <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
                      <AlertTriangle className="h-10 w-10 text-destructive" />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">Rubric Generation Failed</h2>
                    <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">{liveError ?? "Something went wrong while processing your playbook."}</p>
                    <Button
                      onClick={handleStartOver}
                      className="mt-8 rounded-xl bg-lime px-8 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all hover:bg-lime/90"
                    >
                      Start Over
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="relative mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-lime/10">
                      <Sparkles className="h-10 w-10 animate-pulse text-lime" />
                      <div className="absolute inset-0 animate-ping rounded-full border-2 border-lime/20" />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                      {mode === "live" && liveStatus === "creating"
                        ? "Uploading Source Material..."
                        : liveProgress?.title ?? "Generating Rubric..."}
                    </h2>
                    <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                      {mode === "live" && liveStatus === "creating"
                        ? "Saving this playbook and uploading your source files."
                        : liveProgress?.detail ?? "Playcall is analyzing your source material to propose evaluation categories, criteria, and scoring weights."}
                    </p>
                    {mode === "live" && liveProgress ? (
                      <div className="mt-12 w-full max-w-2xl text-left">
                        <div className="flex items-center justify-between mb-4 px-2">
                          <h3 className="text-sm font-semibold tracking-tight text-foreground/90">Source Material Progress</h3>
                          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                            {liveProgress.sourceCounts.attached > 0 && (
                              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-lime" />{liveProgress.sourceCounts.attached} Ready</span>
                            )}
                            {liveProgress.sourceCounts.processing > 0 && (
                              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />{liveProgress.sourceCounts.processing} Processing</span>
                            )}
                            {liveProgress.sourceCounts.failed > 0 && (
                              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" />{liveProgress.sourceCounts.failed} Failed</span>
                            )}
                          </div>
                        </div>

                        {liveSourceDocuments && liveSourceDocuments.length > 0 ? (
                          <div className="space-y-2">
                            {liveSourceDocuments.map((source) => (
                              <div key={source.id} className="group relative flex items-center justify-between rounded-2xl border border-border/10 bg-surface/10 hover:bg-surface/30 hover:border-border/20 transition-all px-5 py-4 shadow-sm">
                                <div className="flex items-center gap-4">
                                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                                    source.status === "failed" ? "bg-rose-500/10 text-rose-500" :
                                    source.status === "processing" ? "bg-yellow-500/10 text-yellow-500" :
                                    "bg-lime/10 text-lime"
                                  }`}>
                                    <FileIcon className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{source.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{source.type}</p>
                                      {source.error && (
                                        <>
                                          <span className="text-border/40">•</span>
                                          <p className="text-[11px] text-rose-400 font-medium">{source.error}</p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {source.status === "processing" && (
                                    <div className="w-4 h-4 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
                                  )}
                                  <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                                    source.status === "failed" ? "bg-rose-500/10 text-rose-500" :
                                    source.status === "processing" ? "bg-yellow-500/10 text-yellow-500" :
                                    "bg-lime/10 text-lime"
                                  }`}>
                                    {source.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </motion.div>
            ) : null}

            {step === 4 ? (
              <motion.div
                key="step-4"
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-8 pb-10"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                      <Sparkles className="h-5 w-5 text-lime" />
                      Generated Rubric
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">Review, tweak weights, or add/remove categories. Total weight must equal 100%.</p>
                    {mode === "live" && liveProgress?.elapsedLabel ? (
                      <p className="mt-2 text-xs font-mono uppercase tracking-[0.18em] text-lime">
                        Created in {liveProgress.elapsedLabel}
                      </p>
                    ) : null}
                  </div>
                </div>

                {mode === "live" && liveError ? <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">{liveError}</div> : null}

                {rubric.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/40 bg-surface/20 px-6 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">No generated rubric yet</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Playcall finished processing, but no categories were returned. Go back to source material and try again, or add categories manually here.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="uppercase tracking-wider text-muted-foreground">Weight Distribution</span>
                    <span className={totalWeight === 100 ? "text-lime" : "text-destructive"}>Total: {totalWeight}%</span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface/30 shadow-inner">
                    {rubric.map((category, index) => {
                      const hue = (index * 137.508) % 360
                      const isOver = totalWeight > 100
                      return (
                        <motion.div
                          key={category.id}
                          initial={{ width: 0 }}
                          animate={{ width: `${(category.weight / Math.max(totalWeight, 100)) * 100}%` }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          className={`h-full ${isOver ? "bg-destructive/80" : ""}`}
                          style={{ backgroundColor: isOver ? undefined : `hsl(${hue}, 70%, 50%)` }}
                          title={`${category.name}: ${category.weight}%`}
                        />
                      )
                    })}
                    {totalWeight < 100 ? <div className="h-full flex-1 bg-transparent" /> : null}
                  </div>
                </div>

                <div className="grid gap-4">
                  <AnimatePresence>
                    {rubric.map((category) => (
                      <motion.div
                        key={category.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0 }}
                        className="group rounded-2xl border border-border/40 bg-surface/30 p-5 transition-colors hover:border-lime/30"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="mb-2 flex items-center gap-3">
                              <Input
                                value={category.name}
                                onChange={(event) => handleCategoryNameChange(category.id, event.target.value)}
                                className="h-9 border-transparent bg-transparent px-0 font-medium transition-all focus:border-border/40 focus:bg-background/50 focus:px-3"
                              />
                            </div>
                            <ul className="ml-1 space-y-1.5">
                              {category.criteria.map((criterion, index) => (
                                <li key={`${category.id}-${index}`} className="flex w-full items-center gap-2 text-sm text-muted-foreground">
                                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime/50" />
                                  <Input
                                    value={criterion}
                                    onChange={(event) => handleCriterionChange(category.id, index, event.target.value)}
                                    className="h-8 w-full border-transparent bg-transparent px-1 text-sm text-muted-foreground transition-all focus:border-border/40 focus:bg-background/50 focus:px-2"
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <div className="relative">
                              <Input
                                type="number"
                                value={category.weight}
                                onChange={(event) => handleWeightChange(category.id, event.target.value)}
                                className="w-20 border-border/40 bg-background/50 pr-6 text-right font-mono"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveCategory(category.id)}
                              className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  <Button
                    onClick={handleAddCategory}
                    variant="outline"
                    className="h-14 w-full rounded-2xl border-dashed border-border/40 bg-surface/10 transition-all hover:border-lime/30 hover:bg-surface/30"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Category
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {step !== 3 ? (
          <div className="sticky bottom-0 left-0 right-0 z-10 flex items-center justify-between border-t border-border/40 bg-card/80 px-6 py-5 backdrop-blur-md md:px-10">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={step === 1 || isLiveReviewLocked}
              className="rounded-xl px-6 text-muted-foreground hover:bg-surface/50 hover:text-foreground"
            >
              Back
            </Button>

            {step < 4 ? (
              <Button onClick={handleNext} className="gap-2 rounded-xl bg-lime px-8 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all hover:bg-lime/90">
                {step === 2 ? (
                  <>
                    Generate Rubric <Sparkles className="h-4 w-4" />
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                {mode === "live" ? (
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit("draft")}
                    disabled={totalWeight !== 100 || isSubmitting || isSavingRubric}
                    className="rounded-xl px-6"
                  >
                    {savingTarget === "draft" ? "Saving Draft..." : "Save Draft"}
                  </Button>
                ) : null}
                <Button
                  onClick={() => handleSubmit("published")}
                  disabled={totalWeight !== 100 || isSubmitting || isSavingRubric}
                  className="rounded-xl bg-lime px-8 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all hover:bg-lime/90 disabled:opacity-50"
                >
                  {savingTarget === "published" || isSubmitting ? "Publishing..." : submitLabel}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
