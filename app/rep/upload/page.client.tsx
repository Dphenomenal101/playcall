"use client"

import { upload } from "@vercel/blob/client"
import { RepDashboardLayout } from "@/components/dashboard/rep-dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileAudio, FileUp } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useDashboard } from "@/context/dashboard-context"
import { useRouter } from "next/navigation"
import { CALL_TYPES } from "@/lib/playcall-data"
import type { RepWorkspaceData } from "@/lib/data/workspace-types"

interface RepUploadClientProps {
  initialData: RepWorkspaceData
  isDemoMode: boolean
}

function UploadCallPageInner({ initialData, isDemoMode }: RepUploadClientProps) {
  const { addNotification } = useDashboard()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState(1)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    playbook: "enterprise-discovery",
    callType: "discovery",
    transcriptSource: "file",
    dealStageBefore: "problem-aware",
    dealStageAfter: "solution-aware",
    outcome: "next-step-booked",
    company: "",
    companyDomain: "",
    contactName: "",
    contactRole: "",
    contactEmail: "",
    linkedinUrl: "",
    transcript: "",
    notes: "",
    pipelineValue: "",
  })

  const availablePlaybooks = isDemoMode
    ? [
        { id: "pb-enterprise-discovery", slug: "enterprise-discovery", name: "Enterprise Discovery" },
        { id: "pb-smb-discovery", slug: "smb-discovery", name: "SMB Discovery" },
        { id: "pb-new-launch-demo", slug: "new-launch-demo", name: "New Launch Demo" },
        { id: "pb-renewal-expansion", slug: "renewal-expansion", name: "Renewal Expansion" },
      ]
    : initialData.playbooks

  useEffect(() => {
    if (availablePlaybooks.length === 0) {
      return
    }

    const hasSelectedPlaybook = availablePlaybooks.some((playbook) => playbook.slug === formData.playbook)
    if (!hasSelectedPlaybook) {
      setFormData((current) => ({
        ...current,
        playbook: availablePlaybooks[0].slug,
      }))
    }
  }, [availablePlaybooks, formData.playbook])

  const analysisCallId = useMemo(() => {
    if (formData.playbook === "enterprise-discovery") return "call-001"
    if (formData.playbook === "smb-discovery") return "call-002"
    if (formData.playbook === "new-launch-demo") return "call-003"
    return "call-004"
  }, [formData.playbook])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const PERSONAL_EMAIL_DOMAINS = new Set([
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
  ])

  const [companyDomainAutofilled, setCompanyDomainAutofilled] = useState(false)

  const handleContactEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    if (formData.companyDomain.trim() && !companyDomainAutofilled) {
      setFormData((prev) => ({ ...prev, contactEmail: value }))
      return
    }

    const domain = value.split("@")[1]?.trim().toLowerCase()
    const looksLikeRealDomain = !!domain && domain.includes(".") && !PERSONAL_EMAIL_DOMAINS.has(domain)

    if (looksLikeRealDomain) {
      setCompanyDomainAutofilled(true)
    }

    setFormData((prev) => ({
      ...prev,
      contactEmail: value,
      companyDomain: looksLikeRealDomain ? domain : prev.companyDomain,
    }))
  }

  const handleCompanyDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCompanyDomainAutofilled(false)
    setFormData((prev) => ({ ...prev, companyDomain: e.target.value }))
  }

  const handlePipelineAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/[^0-9]/g, "")
    setFormData(prev => ({ ...prev, pipelineValue: digitsOnly }))
  }

  const formatPipelineAmountDisplay = (digits: string) => {
    if (!digits) return ""
    return `$${Number(digits).toLocaleString("en-US")}`
  }

  const handleFileDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(true)
  }

  const handleFileDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
  }

  const AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "ogg", "aac", "flac", "webm", "mpeg", "mpga"])
  const DOC_EXTS = new Set(["pdf", "docx", "txt", "csv", "pptx"])

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const ext = (file.name.split(".").pop() ?? "").toLowerCase()
    const isAudio = AUDIO_EXTS.has(ext)
    const isDoc = DOC_EXTS.has(ext)

    if (formData.transcriptSource === "file" && isAudio) {
      addNotification({ title: "Wrong file type", message: "Switch to 'Audio recording' to upload audio files. This field accepts PDF, DOCX, TXT, CSV, or PPTX.", type: "error" })
      return
    }
    if (formData.transcriptSource === "audio" && isDoc) {
      addNotification({ title: "Wrong file type", message: "Switch to 'Transcript document' to upload document files.", type: "error" })
      return
    }

    setSelectedFile(file)
  }

  const handleNext = () => {
    if (step === 2 && (!formData.company.trim() || !formData.contactName.trim())) {
      addNotification({
        title: "Company and contact name required",
        message: "Both feed directly into scoring and enrichment - an unnamed call can't be scored as buyer-aware.",
        type: "error",
      })
      return
    }

    if (step === 2 && !isDemoMode && !formData.linkedinUrl.trim() && !formData.contactEmail.trim()) {
      addNotification({
        title: "LinkedIn URL or email required",
        message: "Live buyer-aware scoring requires the primary contact's LinkedIn URL or email before submission.",
        type: "error",
      })
      return
    }

    if (step === 3 && !selectedFile) {
      addNotification({
        title: "Call file required",
        message: "Upload a transcript document or audio file before continuing.",
        type: "error",
      })
      return
    }

    if (step < 4) {
      setStep(step + 1)
      return
    }

    if (!isDemoMode) {
      void submitLiveCall()
      return
    }

    addNotification({
      title: "Analysis started",
      message: "Transcription, enrichment, and scoring are in progress.",
      type: "success",
    })
    router.push(`/rep/calls/${analysisCallId}?processing=1`)
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const submitLiveCall = async () => {
    try {
      setIsSubmitting(true)

      const payload = new FormData()
      const selectedPlaybook = availablePlaybooks.find((playbook) => playbook.slug === formData.playbook)
      payload.set("playbookId", selectedPlaybook?.id ?? "")
      payload.set("callType", formData.callType)
      payload.set("transcriptSource", formData.transcriptSource)
      payload.set("dealStageBefore", formData.dealStageBefore)
      payload.set("dealStageAfter", formData.dealStageAfter)
      payload.set("outcome", formData.outcome)
      payload.set("company", formData.company)
      payload.set("companyDomain", formData.companyDomain)
      payload.set("contactName", formData.contactName)
      payload.set("contactRole", formData.contactRole)
      payload.set("contactEmail", formData.contactEmail)
      payload.set("linkedinUrl", formData.linkedinUrl)
      payload.set("notes", formData.notes)
      payload.set("pipelineValue", formData.pipelineValue)

      if (selectedFile) {
        const isAudio = formData.transcriptSource === "audio"
        if (isAudio) {
          const result = await upload(selectedFile.name, selectedFile, {
            access: "public",
            handleUploadUrl: "/api/blob-upload",
          })
          payload.set("audioBlobUrl", result.url)
          payload.set("audioFileName", selectedFile.name)
        } else {
          payload.set("file", selectedFile)
        }
      }

      const response = await fetch("/api/live/rep/calls", {
        method: "POST",
        body: payload,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to submit call")
      }

      addNotification({
        title: "Analysis started",
        message: "Transcription, enrichment, and scoring are in progress.",
        type: "success",
      })
      router.push(`/rep/calls/${result.id}?processing=1`)
    } catch (error) {
      addNotification({
        title: "Submission failed",
        message: error instanceof Error ? error.message : "Unable to submit this call right now.",
        type: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-10 font-sans">
      {/* Header */}
      <div className="mb-10 max-w-2xl">
        <div className="mb-4 inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
          <div className="mr-2 h-1.5 w-1.5 rounded-full bg-lime/80 shadow-[0_0_8px_rgba(163,230,53,0.8)] pulse-live" />
          <span className="font-mono uppercase tracking-[0.2em] text-muted-foreground">Upload & Score</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">Upload a Call</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {isDemoMode
            ? "Submit a transcript or audio file with the buyer context needed to score it correctly"
            : "Submit a transcript or audio file with the buyer context needed for live buyer-aware scoring."}
        </p>
      </div>

      {/* Progress Steps Indicators */}
      <div className="mb-10 grid gap-3 md:grid-cols-4">
        {[
          { step: 1, label: "Playbook", detail: "Pick the playbook and call type" },
          { step: 2, label: "Buyer Context", detail: "Add deal stage, account, and contact details" },
          { step: 3, label: "Call Data", detail: "Upload transcript or audio, then set outcome details" },
          { step: 4, label: "Review", detail: "Confirm the pre-score inputs before submitting" },
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
              {isActive && (
                <div className="absolute -left-6 -top-6 h-16 w-16 rounded-full bg-lime/20 blur-xl" />
              )}
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <p className={`text-[10px] font-mono uppercase tracking-[0.2em] ${isActive || isDone ? "text-lime" : "text-muted-foreground"}`}>
                    Step {item.step}
                  </p>
                  {isDone && (
                    <div className="h-4 w-4 rounded-full bg-lime/20 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-lime" />
                    </div>
                  )}
                </div>
                <p className={`text-sm font-semibold tracking-tight ${isActive || isDone ? "text-foreground" : "text-foreground/70"}`}>
                  {item.label}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {item.detail}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Form Container */}
      <div className="relative max-w-3xl overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl md:p-10">
        <div className="pointer-events-none absolute -right-40 -top-40 h-80 w-80 rounded-full bg-lime/5 blur-3xl" />

        <div className="relative">
          {/* Step 1: Playbook Selection */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Step 1: Select Playbook</h2>
                <p className="mt-2 text-sm text-muted-foreground">Choose the framework to score against.</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Which playbook?</label>
                  <select
                    name="playbook"
                    value={formData.playbook}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                  >
                    {availablePlaybooks.map((playbook) => (
                      <option key={playbook.id} value={playbook.slug}>
                        {playbook.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Call Type</label>
                  <select
                    name="callType"
                    value={formData.callType}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                  >
                    {CALL_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Deal Info */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Step 2: Deal Information</h2>
                <p className="mt-2 text-sm text-muted-foreground">Contextual details that dynamically shape the scorecard.</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deal Stage Before Call</label>
                  <select
                    name="dealStageBefore"
                    value={formData.dealStageBefore}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                  >
                    <option value="unaware">Unaware</option>
                    <option value="problem-aware">Problem-aware</option>
                    <option value="solution-aware">Solution-aware</option>
                    <option value="vendor-evaluating">Vendor evaluating</option>
                    <option value="committed">Committed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company *</label>
                  <Input
                    type="text"
                    name="company"
                    placeholder="Acme Inc."
                    value={formData.company}
                    onChange={handleChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company Domain</label>
                  <Input
                    type="text"
                    name="companyDomain"
                    placeholder="acme.com"
                    value={formData.companyDomain}
                    onChange={handleCompanyDomainChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary Contact *</label>
                  <Input
                    type="text"
                    name="contactName"
                    placeholder="John Smith"
                    value={formData.contactName}
                    onChange={handleChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary Contact Role</label>
                  <Input
                    type="text"
                    name="contactRole"
                    placeholder="Head of RevOps"
                    value={formData.contactRole}
                    onChange={handleChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Email</label>
                  <Input
                    type="email"
                    name="contactEmail"
                    placeholder="john@acme.com"
                    value={formData.contactEmail}
                    onChange={handleContactEmailChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">LinkedIn URL</label>
                  <Input
                    type="text"
                    name="linkedinUrl"
                    placeholder="linkedin.com/in/johnsmith"
                    value={formData.linkedinUrl}
                    onChange={handleChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isDemoMode
                      ? "Optional in demo mode."
                      : "Recommended for the most accurate enrichment - if missing, contact email is used instead."}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">ARR / Pipeline Amount (Optional)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    name="pipelineValue"
                    placeholder="$25,000"
                    value={formatPipelineAmountDisplay(formData.pipelineValue)}
                    onChange={handlePipelineAmountChange}
                    className="rounded-xl border border-border/50 bg-background/50 px-4 py-6 text-sm outline-none transition-colors focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Upload Transcript */}
          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Step 3: Upload Call Data</h2>
                <p className="mt-2 text-sm text-muted-foreground">Provide the transcript or audio file to be analyzed.</p>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Source</label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setFormData((current) => ({ ...current, transcriptSource: "file" }))}
                      className={`group relative flex flex-col items-start overflow-hidden rounded-2xl border p-5 transition-all ${
                        formData.transcriptSource === "file"
                          ? "border-lime/40 bg-lime/5 shadow-[0_0_15px_rgba(163,230,53,0.1)]"
                          : "border-border/40 bg-surface/30 hover:bg-surface/50 hover:border-border/60"
                      }`}
                    >
                      {formData.transcriptSource === "file" && (
                        <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-lime/10 blur-xl" />
                      )}
                      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                        formData.transcriptSource === "file" ? "border-lime/30 bg-lime/10 text-lime" : "border-border/50 bg-background/50 text-muted-foreground group-hover:text-foreground"
                      }`}>
                        <FileUp className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-foreground/90">Transcript document</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">PDF, DOCX, TXT, CSV, or PPTX.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((current) => ({ ...current, transcriptSource: "audio" }))}
                      className={`group relative flex flex-col items-start overflow-hidden rounded-2xl border p-5 transition-all ${
                        formData.transcriptSource === "audio"
                          ? "border-lime/40 bg-lime/5 shadow-[0_0_15px_rgba(163,230,53,0.1)]"
                          : "border-border/40 bg-surface/30 hover:bg-surface/50 hover:border-border/60"
                      }`}
                    >
                      {formData.transcriptSource === "audio" && (
                        <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-lime/10 blur-xl" />
                      )}
                      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                        formData.transcriptSource === "audio" ? "border-lime/30 bg-lime/10 text-lime" : "border-border/50 bg-background/50 text-muted-foreground group-hover:text-foreground"
                      }`}>
                        <FileAudio className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-foreground/90">Audio file</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">MP3, WAV, or M4A for transcription.</p>
                    </button>
                  </div>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleFileDragOver}
                  onDragEnter={handleFileDragOver}
                  onDragLeave={handleFileDragLeave}
                  onDrop={handleFileDrop}
                  className={`group relative overflow-hidden rounded-2xl border border-dashed p-10 text-center transition-all cursor-pointer ${
                    isDraggingFile
                      ? "border-lime/60 bg-lime/10"
                      : "border-border/60 bg-surface/20 hover:bg-surface/30 hover:border-lime/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={formData.transcriptSource === "audio" ? ".mp3,.wav,.m4a,audio/*" : ".pdf,.docx,.txt,.csv,.pptx"}
                    className="hidden"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-10">
                    <div className="h-40 w-40 rounded-full bg-lime blur-3xl" />
                  </div>
                  {formData.transcriptSource === "file" ? (
                    <>
                      <FileUp className="mx-auto mb-4 h-10 w-10 text-lime" />
                      <p className="text-sm font-medium text-foreground">Click to browse or drag document here</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Supports PDF, DOCX, TXT, CSV, and PPTX up to 4MB.
                      </p>
                      {selectedFile ? <p className="mt-3 text-sm font-medium text-lime">{selectedFile.name}</p> : null}
                    </>
                  ) : (
                    <>
                      <FileAudio className="mx-auto mb-4 h-10 w-10 text-lime" />
                      <p className="text-sm font-medium text-foreground">Click to browse or drag audio here</p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground max-w-sm mx-auto">
                        Upload MP3, WAV, or M4A. Playcall will automatically separate speakers and transcribe the audio before scoring.
                      </p>
                      {selectedFile ? <p className="mt-3 text-sm font-medium text-lime">{selectedFile.name}</p> : null}
                    </>
                  )}
                </div>

                <div className="grid gap-6 pt-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deal Stage After</label>
                    <select
                      name="dealStageAfter"
                      value={formData.dealStageAfter}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                    >
                      <option value="problem-aware">Problem-aware</option>
                      <option value="solution-aware">Solution-aware</option>
                      <option value="vendor-evaluating">Vendor evaluating</option>
                      <option value="committed">Committed</option>
                      <option value="closed-lost">Closed lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outcome</label>
                    <select
                      name="outcome"
                      value={formData.outcome}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50"
                    >
                      <option value="no-show">No-show</option>
                      <option value="next-step-booked">Next step booked</option>
                      <option value="moved-stage">Moved stage</option>
                      <option value="no-advancement">No advancement</option>
                      <option value="closed-won">Closed won</option>
                      <option value="closed-lost">Closed lost</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Step 4: Review & Submit</h2>
                <p className="mt-2 text-sm text-muted-foreground">Verify your inputs. This data is used to dynamically weight the playbook.</p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border/40 bg-surface/20">
                <div className="divide-y divide-border/30">
                  <div className="flex justify-between px-5 py-4 text-sm hover:bg-surface/40 transition-colors">
                    <span className="text-muted-foreground">Playbook</span>
                    <span className="font-semibold text-foreground/90 capitalize">{formData.playbook.replace('-', ' ')}</span>
                  </div>
                  <div className="flex justify-between px-5 py-4 text-sm hover:bg-surface/40 transition-colors">
                    <span className="text-muted-foreground">Stage Movement</span>
                    <span className="font-semibold text-foreground/90 capitalize">
                      {formData.dealStageBefore.replace('-', ' ')} <span className="text-muted-foreground font-normal mx-1">→</span> {formData.dealStageAfter.replace('-', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between px-5 py-4 text-sm hover:bg-surface/40 transition-colors">
                    <span className="text-muted-foreground">Outcome</span>
                    <span className="font-semibold text-foreground/90 capitalize">{formData.outcome.replace('-', ' ')}</span>
                  </div>
                  <div className="flex justify-between px-5 py-4 text-sm hover:bg-surface/40 transition-colors">
                    <span className="text-muted-foreground">Company Details</span>
                    <span className="font-semibold text-foreground/90 text-right">
                      {formData.company || "—"}<br/>
                      <span className="text-xs text-muted-foreground font-normal">{formData.companyDomain}</span>
                    </span>
                  </div>
                  <div className="flex justify-between px-5 py-4 text-sm hover:bg-surface/40 transition-colors">
                    <span className="text-muted-foreground">Contact Details</span>
                    <span className="font-semibold text-foreground/90 text-right">
                      {formData.contactName || "—"}<br/>
                      <span className="text-xs text-muted-foreground font-normal">{formData.contactRole}</span>
                    </span>
                  </div>
                  <div className="flex justify-between px-5 py-4 text-sm hover:bg-surface/40 transition-colors">
                    <span className="text-muted-foreground">ARR / Pipeline</span>
                    <span className="font-semibold text-lime">{formatPipelineAmountDisplay(formData.pipelineValue) || "—"}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Additional Notes</label>
                <textarea
                  name="notes"
                  placeholder="Additional context about this lead or account, including email threads, prior conversations, or anything not fully captured in the playbook."
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full resize-none rounded-xl border border-border/50 bg-background/50 px-4 py-4 text-sm outline-none transition-colors focus:border-lime/50 focus:ring-1 focus:ring-lime/50 h-32"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-10 flex items-center justify-between border-t border-border/40 pt-6">
            <Button
              onClick={handleBack}
              variant="outline"
              className="rounded-xl border-border/50 bg-background/40 px-6 py-6 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-background/80"
              disabled={step === 1}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={isSubmitting}
              className="gap-2 rounded-xl bg-lime px-8 py-6 text-sm font-semibold text-lime-950 shadow-[0_4px_14px_0_rgba(163,230,53,0.39)] transition-all hover:-translate-y-[1px] hover:bg-lime/90 hover:shadow-[0_6px_20px_rgba(163,230,53,0.23)]"
            >
              {step === 4 ? (
                <>
                  <Upload className="h-4 w-4" />
                  {isSubmitting ? "Submitting..." : "Submit & Score"}
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RepUploadClient({ initialData, isDemoMode }: RepUploadClientProps) {
  return (
    <RepDashboardLayout>
      <UploadCallPageInner initialData={initialData} isDemoMode={isDemoMode} />
    </RepDashboardLayout>
  )
}
