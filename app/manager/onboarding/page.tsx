"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SessionBadge } from "@/components/auth/session-badge"
import { PlaybookBuilder } from "@/components/playbook-builder"
import { useToast } from "@/hooks/use-toast"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

type ProviderField = {
  key: string
  label: string
  kind: string
  placeholder?: string
  required?: boolean
  helperText?: string
  value: string
  configured: boolean
}

type ProviderOption = {
  id: string
  label: string
  defaultModel?: string
  models?: string[]
  credentialFields?: Array<{
    key: string
    label: string
    kind: string
    placeholder?: string
    required?: boolean
    helperText?: string
  }>
}

type ProviderConfig = {
  providerId: string
  role: "primary_llm" | "fallback_llm" | "enrichment" | "document_parsing"
  enabled: boolean
  defaultModel: string
  metadata: Record<string, unknown>
  fields: ProviderField[]
}

type SettingsResponse = {
  workspaceName: string
  companyDomain: string
  email: string
  providers: {
    llm: ProviderOption[]
    enrichment: ProviderOption[]
    document_parsing: ProviderOption[]
  }
  selections: {
    primaryLlmProvider: string
    fallbackLlmProvider: string
    enrichmentProvider: string
    documentParsingProvider: string
  }
  providerConfigs: ProviderConfig[]
}

const providerHelpContent: Record<
  string,
  {
    title: string
    body: string
    href?: string
    linkLabel?: string
  }
> = {
  openai: {
    title: "OpenAI",
    body: "Create an API key in your OpenAI project settings, then paste it here as the workspace scoring key.",
    href: "https://platform.openai.com/api-keys",
    linkLabel: "OpenAI API keys",
  },
  anthropic: {
    title: "Anthropic",
    body: "Create a Claude API key in the Anthropic console and use it as the workspace scoring key.",
    href: "https://console.anthropic.com/settings/keys",
    linkLabel: "Anthropic API keys",
  },
  google: {
    title: "Google Generative AI",
    body: "Generate a Gemini API key in Google AI Studio and use it for rubric generation and call scoring.",
    href: "https://aistudio.google.com/app/apikey",
    linkLabel: "Google AI Studio keys",
  },
  "google-vertex": {
    title: "Google Vertex",
    body: "Use a service account with Vertex AI access. You will need the project, location, service account email, and private key.",
    href: "https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal",
    linkLabel: "Vertex AI quickstart",
  },
  vercel: {
    title: "Vercel AI Gateway",
    body: "Create a Vercel AI Gateway key, then enter the gateway key and model route you want Playcall to use.",
    href: "https://vercel.com/docs/ai-gateway",
    linkLabel: "Vercel AI Gateway docs",
  },
  llamaparse: {
    title: "LlamaParse",
    body: "Parses PDFs, DOCX, PPTX, images, and visual layouts into clean text for rubric generation. Free tier gives 10,000 credits per month (resets monthly) — enough for hundreds of playbooks.",
    href: "https://cloud.llamaindex.ai/api-key",
    linkLabel: "Get a free LlamaParse API key",
  },
}

function buildConfigForRole(
  role: ProviderConfig["role"],
  providerId: string,
  providerOptions: Record<ProviderConfig["role"], ProviderOption[]>,
  providerConfigs: ProviderConfig[]
) {
  const existing = providerConfigs.find((config) => config.role === role && config.providerId === providerId)
  if (existing) {
    return existing
  }

  const option = providerOptions[role].find((entry) => entry.id === providerId)

  return {
    providerId,
    role,
    enabled: true,
    defaultModel: option?.defaultModel ?? "",
    metadata: {},
    fields: (option?.credentialFields ?? []).map((field) => ({
      ...field,
      value: "",
      configured: false,
    })),
  } satisfies ProviderConfig
}

function KeyValidationStatus({ status, message }: { status: "checking" | "valid" | "invalid"; message?: string }) {
  if (status === "checking") {
    return <p className="mt-1 text-[11px] font-medium text-muted-foreground">Checking...</p>
  }
  if (status === "valid") {
    return <p className="mt-1 text-[11px] font-medium text-lime">Valid</p>
  }
  return <p className="mt-1 text-[11px] font-medium text-rose-400">Invalid - {message ?? "key rejected"}</p>
}

function CredentialField({
  field,
  fieldId,
  validation,
  isRevealed,
  onToggleReveal,
  onChange,
}: {
  field: ProviderField
  fieldId: string
  validation?: { status: "checking" | "valid" | "invalid"; message?: string }
  isRevealed: boolean
  onToggleReveal: () => void
  onChange: (value: string) => void
}) {
  const isSecret = field.kind === "secret" || field.kind === "apiKey"

  return (
    <div>
      <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">{field.label}</label>
      <div className="relative">
        <Input
          type={isSecret && !isRevealed ? "password" : "text"}
          autoComplete={isSecret ? "new-password" : "off"}
          value={field.value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn("h-12 rounded-xl border-border/40 bg-surface/30 font-mono", isSecret && field.value && "pr-10")}
        />
        {isSecret && field.value ? (
          <button
            type="button"
            onClick={onToggleReveal}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isRevealed ? "Hide value" : "Show value"}
          >
            {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {validation ? (
        <KeyValidationStatus status={validation.status} message={validation.message} />
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {field.helperText ?? (field.configured ? "Configured" : field.required ? "Required" : "Optional")}
        </p>
      )}
    </div>
  )
}

function getMissingRequiredFields(config: ProviderConfig) {
  const missingFields = config.fields
    .filter((field) => field.required && !field.configured && !field.value.trim())
    .map((field) => field.label)

  if ((config.role === "primary_llm" || config.role === "fallback_llm") && !config.defaultModel.trim()) {
    missingFields.unshift("Default model")
  }

  return missingFields
}

function ProviderHelp({ providerId }: { providerId: string }) {
  const help = providerHelpContent[providerId] ?? {
    title: "Provider setup",
    body: "Create credentials in the provider dashboard, then paste the required values here.",
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/40 bg-background/30 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`How to set up ${help.title}`}
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="rounded-2xl border-border/40 bg-card/95 p-4 backdrop-blur-xl"
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{help.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{help.body}</p>
          {help.href ? (
            <a
              href={help.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-lime transition-colors hover:text-lime/80"
            >
              {help.linkLabel ?? "Open docs"}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function ManagerOnboardingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState(1)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [workspaceForm, setWorkspaceForm] = useState({
    name: "",
    domain: "",
  })
  const [createdPlaybook, setCreatedPlaybook] = useState<{ playbookId: string; slug: string } | null>(null)
  const [managerEmail, setManagerEmail] = useState("")
  const [managerName, setManagerName] = useState("")
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const [workspaceStepError, setWorkspaceStepError] = useState<string | null>(null)
  const [providerGroups, setProviderGroups] = useState<SettingsResponse["providers"]>({
    llm: [],
    enrichment: [],
    document_parsing: [],
  })
  const [selections, setSelections] = useState<SettingsResponse["selections"]>({
    primaryLlmProvider: "openai",
    fallbackLlmProvider: "anthropic",
    enrichmentProvider: "exa",
    documentParsingProvider: "llamaparse",
  })
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([])
  const [keysStepError, setKeysStepError] = useState<string | null>(null)
  const [isLoadingKeys, setIsLoadingKeys] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [isSavingKeys, setIsSavingKeys] = useState(false)
  const [keyValidation, setKeyValidation] = useState<
    Record<string, { status: "checking" | "valid" | "invalid"; message?: string }>
  >({})
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())

  const toggleFieldReveal = (fieldId: string) => {
    setRevealedFields((current) => {
      const next = new Set(current)
      if (next.has(fieldId)) {
        next.delete(fieldId)
      } else {
        next.add(fieldId)
      }
      return next
    })
  }

  const [invites, setInvites] = useState(["", "", ""])
  const [isFinishing, setIsFinishing] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadContext() {
      const response = await fetch("/api/live/auth/onboarding-context")
      if (!response.ok) {
        return
      }

      const payload = await response.json()
      if (!isMounted) {
        return
      }

      setManagerEmail(payload.email ?? "")
      setManagerName(payload.fullName ?? "")
      setWorkspaceForm((current) => ({
        ...current,
        name: current.name || payload.workspaceName || payload.suggestedWorkspaceName || "My Revenue Team",
        domain: current.domain || payload.domain || "",
      }))

      // Rehydrate the already-bootstrapped workspace id, if any - without
      // this, a refresh anywhere in the flow (after Step 1 succeeds) drops
      // it back to null, and clicking Continue again on Step 1 creates a
      // second, duplicate workspace instead of reusing the existing one.
      if (typeof payload.workspaceId === "string" && payload.workspaceId) {
        setWorkspaceId(payload.workspaceId)
      }
    }

    void loadContext()

    return () => {
      isMounted = false
    }
  }, [])

  const managerLabel = useMemo(() => {
    if (managerName) {
      return managerName
    }

    if (managerEmail) {
      return managerEmail
    }

    return "your team"
  }, [managerEmail, managerName])

  const providerOptions = useMemo(
    () => ({
      primary_llm: providerGroups.llm,
      fallback_llm: providerGroups.llm,
      enrichment: providerGroups.enrichment,
      document_parsing: providerGroups.document_parsing,
    }),
    [providerGroups]
  )

  const selectedPrimaryConfig = useMemo(
    () => buildConfigForRole("primary_llm", selections.primaryLlmProvider, providerOptions, providerConfigs),
    [providerConfigs, providerOptions, selections.primaryLlmProvider]
  )

  const selectedFallbackConfig = useMemo(
    () => buildConfigForRole("fallback_llm", selections.fallbackLlmProvider, providerOptions, providerConfigs),
    [providerConfigs, providerOptions, selections.fallbackLlmProvider]
  )

  const selectedEnrichmentConfig = useMemo(
    () => buildConfigForRole("enrichment", selections.enrichmentProvider, providerOptions, providerConfigs),
    [providerConfigs, providerOptions, selections.enrichmentProvider]
  )

  const selectedDocumentParsingConfig = useMemo(
    () => buildConfigForRole("document_parsing", selections.documentParsingProvider, providerOptions, providerConfigs),
    [providerConfigs, providerOptions, selections.documentParsingProvider]
  )

  async function loadWorkspaceSettings() {
    setIsLoadingKeys(true)
    setKeysStepError(null)

    try {
      const response = await fetch("/api/live/manager/settings")
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load provider settings")
      }

      setProviderGroups(payload.providers ?? { llm: [], enrichment: [], document_parsing: [] })
      setSelections(payload.selections ?? selections)
      setProviderConfigs(payload.providerConfigs ?? [])
      setWorkspaceForm((current) => ({
        ...current,
        name: current.name || payload.workspaceName || "",
        domain: current.domain || payload.companyDomain || "",
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load provider settings."
      setKeysStepError(message)
      toast({
        title: "Unable to load provider settings",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsLoadingKeys(false)
    }
  }

  useEffect(() => {
    if (step === 2 && workspaceId && providerGroups.llm.length === 0 && !isLoadingKeys) {
      void loadWorkspaceSettings()
    }
  }, [isLoadingKeys, providerGroups.llm.length, step, workspaceId])

  const handleProviderSelectionChange = (
    role: ProviderConfig["role"],
    providerId: string
  ) => {
    setKeysStepError(null)
    setSelections((current) => {
      if (role === "primary_llm") {
        return { ...current, primaryLlmProvider: providerId }
      }
      if (role === "fallback_llm") {
        return { ...current, fallbackLlmProvider: providerId }
      }
      if (role === "enrichment") {
        return { ...current, enrichmentProvider: providerId }
      }
      return { ...current, documentParsingProvider: providerId }
    })
  }

  const handleProviderFieldChange = (
    role: ProviderConfig["role"],
    providerId: string,
    fieldKey: string,
    value: string
  ) => {
    setKeysStepError(null)

    if (fieldKey === "apiKey" || fieldKey === "accessKey") {
      const fieldId = `${role}-${providerId}-${fieldKey}`
      setKeyValidation((current) => {
        if (!(fieldId in current)) {
          return current
        }
        const next = { ...current }
        delete next[fieldId]
        return next
      })
    }

    setProviderConfigs((current) => {
      const existing = current.find((config) => config.role === role && config.providerId === providerId)

      if (!existing) {
        const option = providerOptions[role].find((entry) => entry.id === providerId)
        return [
          ...current,
          {
            providerId,
            role,
            enabled: true,
            defaultModel: option?.defaultModel ?? "",
            metadata: {},
            fields: (option?.credentialFields ?? []).map((field) => ({
              ...field,
              value: field.key === fieldKey ? value : "",
              configured: field.key === fieldKey ? Boolean(value.trim()) : false,
            })),
          },
        ]
      }

      return current.map((config) =>
        config.role === role && config.providerId === providerId
          ? {
              ...config,
              fields: config.fields.map((field) =>
                field.key === fieldKey ? { ...field, value, configured: Boolean(value.trim()) } : field
              ),
            }
          : config
      )
    })
  }

  const handleDefaultModelChange = (role: ProviderConfig["role"], providerId: string, value: string) => {
    setKeysStepError(null)
    setProviderConfigs((current) => {
      const existing = current.find((config) => config.role === role && config.providerId === providerId)

      if (!existing) {
        const option = providerOptions[role].find((entry) => entry.id === providerId)
        return [
          ...current,
          {
            providerId,
            role,
            enabled: true,
            defaultModel: value || option?.defaultModel || "",
            metadata: {},
            fields: (option?.credentialFields ?? []).map((field) => ({
              ...field,
              value: "",
              configured: false,
            })),
          },
        ]
      }

      return current.map((config) =>
        config.role === role && config.providerId === providerId ? { ...config, defaultModel: value } : config
      )
    })
  }

  const validateApiKeys = async (configs: ProviderConfig[]) => {
    const checks: Array<{ fieldId: string; providerId: string; fieldKey: string; apiKey: string; secretKey?: string; webhookSecret?: string; baseUrl?: string }> = []

    for (const config of configs) {
      const apiKeyField = config.fields.find((field) => field.key === "apiKey")
      const accessKeyField = config.fields.find((field) => field.key === "accessKey")
      const secretKeyField = config.fields.find((field) => field.key === "secretKey")
      const baseUrlField = config.fields.find((field) => field.key === "baseUrl")

      if (apiKeyField && apiKeyField.value.trim()) {
        checks.push({
          fieldId: `${config.role}-${config.providerId}-apiKey`,
          providerId: config.providerId,
          fieldKey: "apiKey",
          apiKey: apiKeyField.value,
          baseUrl: baseUrlField?.value,
        })
      } else if (accessKeyField && accessKeyField.value.trim() && secretKeyField?.value?.trim()) {
        checks.push({
          fieldId: `${config.role}-${config.providerId}-accessKey`,
          providerId: config.providerId,
          fieldKey: "accessKey",
          apiKey: accessKeyField.value,
          secretKey: secretKeyField.value,
          baseUrl: baseUrlField?.value,
        })
      }

      const webhookField = config.fields.find((field) => field.key === "webhookSigningSecret")
      if (webhookField && webhookField.value.trim()) {
        checks.push({
          fieldId: `${config.role}-${config.providerId}-webhookSigningSecret`,
          providerId: config.providerId,
          fieldKey: "webhookSigningSecret",
          apiKey: apiKeyField?.value ?? "",
          webhookSecret: webhookField.value,
          baseUrl: baseUrlField?.value,
        })
      }
    }

    if (checks.length === 0) {
      return true
    }

    setKeyValidation((current) => {
      const next = { ...current }
      for (const check of checks) {
        next[check.fieldId] = { status: "checking" }
      }
      return next
    })

    const results = await Promise.all(
      checks.map(async (check) => {
        try {
          const response = await fetch("/api/live/manager/settings/validate-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId: check.providerId,
              fieldKey: check.fieldKey,
              apiKey: check.apiKey,
              secretKey: check.secretKey,
              webhookSecret: check.webhookSecret,
              baseUrl: check.baseUrl,
            }),
          })
          const result = await response.json().catch(() => ({ valid: false, message: "Validation failed" }))
          return { fieldId: check.fieldId, providerId: check.providerId, ...result }
        } catch {
          return { fieldId: check.fieldId, providerId: check.providerId, valid: false, message: "Unable to validate" }
        }
      })
    )

    setKeyValidation((current) => {
      const next = { ...current }
      for (const result of results) {
        next[result.fieldId] = { status: result.valid ? "valid" : "invalid", message: result.message }
      }
      return next
    })

    const invalid = results.filter((result) => !result.valid)
    if (invalid.length > 0) {
      const message = invalid.map((result) => `${result.providerId}: ${result.message ?? "Invalid"}`).join(" ")
      setKeysStepError(message)
      toast({
        title: "Validation failed",
        description: message,
        variant: "destructive",
      })
      return false
    }

    return true
  }

  const persistProviderSettings = async (continueToPlaybook: boolean) => {
    if (!workspaceId) {
      setKeysStepError("Create the workspace first before saving provider settings.")
      return
    }

    const primaryMissing = getMissingRequiredFields(selectedPrimaryConfig)
    if (primaryMissing.length > 0) {
      setKeysStepError(`Primary provider is missing: ${primaryMissing.join(", ")}.`)
      return
    }

    // Enrichment isn't best-effort at runtime - the job pipeline queues a
    // buyer_enrichment job before scoring whenever a call has contact info,
    // and won't queue scoring until that job completes. Without a working
    // Exa key, enrichAccountContextWithExa() hard-throws and the call gets
    // stuck in "failed" forever, so this has to be required up front too.
    const enrichmentMissing = getMissingRequiredFields(selectedEnrichmentConfig)
    if (enrichmentMissing.length > 0) {
      setKeysStepError(`Enrichment provider is missing: ${enrichmentMissing.join(", ")}.`)
      return
    }

    setIsSavingKeys(true)
    setKeysStepError(null)

    try {
      const allKeysValid = await validateApiKeys([
        selectedPrimaryConfig,
        selectedFallbackConfig,
        selectedEnrichmentConfig,
        selectedDocumentParsingConfig,
      ])
      if (!allKeysValid) {
        return
      }

      const response = await fetch("/api/live/manager/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceName: workspaceForm.name,
          companyDomain: workspaceForm.domain,
          selections,
          providerConfigs: [
            selectedPrimaryConfig,
            selectedFallbackConfig,
            selectedEnrichmentConfig,
            selectedDocumentParsingConfig,
          ].map((config) => ({
            providerId: config.providerId,
            role: config.role,
            enabled: true,
            defaultModel: config.defaultModel,
            metadata: config.metadata,
            credentials: Object.fromEntries(config.fields.map((field) => [field.key, field.value])),
          })),
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save provider settings")
      }

      setProviderGroups(payload.providers ?? providerGroups)
      setSelections(payload.selections ?? selections)
      setProviderConfigs(payload.providerConfigs ?? providerConfigs)
      setWorkspaceForm((current) => ({
        ...current,
        name: payload.workspaceName ?? current.name,
        domain: payload.companyDomain ?? current.domain,
      }))

      if (continueToPlaybook) {
        setStep(3)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save provider settings."
      setKeysStepError(message)
      toast({
        title: "Unable to save provider settings",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSavingKeys(false)
    }
  }

  const handleNext = async () => {
    if (step === 1) {
      const name = workspaceForm.name.trim()
      const domain = workspaceForm.domain.trim()
      const trimmedManagerName = managerName.trim()

      if (!trimmedManagerName || !name || !domain) {
        setWorkspaceStepError("Your name, workspace name, and company domain are required.")
        return
      }

      setIsBootstrapping(true)
      setWorkspaceStepError(null)
      setOnboardingError(null)

      try {
        const response = await fetch("/api/live/manager/onboarding", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "bootstrap",
            workspaceId,
            workspace: workspaceForm,
            managerName: trimmedManagerName,
          }),
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to create workspace")
        }

        setWorkspaceId(payload.workspaceId)
        await loadWorkspaceSettings()
        setStep(2)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create workspace."
        setWorkspaceStepError(message)
        toast({
          title: "Workspace setup failed",
          description: message,
          variant: "destructive",
        })
      } finally {
        setIsBootstrapping(false)
      }

      return
    }

    setWorkspaceStepError(null)
    setStep((current) => Math.min(4, current + 1))
  }

  const handleBack = () => setStep((current) => Math.max(1, current - 1))

  const handleAddInvite = () => setInvites((prev) => [...prev, ""])

  const handleInviteChange = (index: number, value: string) => {
    const newInvites = [...invites]
    newInvites[index] = value
    setInvites(newInvites)
  }

  const finishOnboarding = async () => {
    setIsFinishing(true)
    setOnboardingError(null)
    try {
      const onboardingResponse = await fetch("/api/live/manager/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "finalize",
          workspaceId,
          workspace: workspaceForm,
          invites,
        }),
      })

      if (!onboardingResponse.ok) {
        const payload = await onboardingResponse.json().catch(() => null)
        throw new Error(payload?.error ?? "Unable to finish workspace setup")
      }

      // The playbook (if any) was already created and saved during step 3 via
      // PlaybookBuilder's live flow — `createdPlaybook` just confirms it exists.
      router.push("/manager")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to finish workspace setup."
      setOnboardingError(message)
      toast({
        title: "Workspace setup failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsFinishing(false)
    }
  }

  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute top-0 right-0 -z-10 h-[800px] w-[800px] rounded-full bg-lime/5 blur-[150px] mix-blend-screen" />
      <div className="absolute bottom-0 left-0 -z-10 h-[600px] w-[600px] rounded-full bg-blue-500/5 blur-[120px]" />

      <div className="z-10 mx-auto mb-10 flex w-full max-w-4xl items-center justify-between px-4">
        <div className="flex max-w-xs flex-1 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                step >= i ? "bg-lime shadow-[0_0_8px_rgba(163,230,53,0.4)]" : "bg-muted/30"
              }`}
            />
          ))}
        </div>
        {step > 1 && step < 3 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        ) : null}
      </div>

      <div className="z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center">
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
              <div className="text-center">
                <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border/50 bg-background/50 px-4 py-1.5 backdrop-blur-sm">
                  <div className="pulse-live h-2 w-2 rounded-full bg-lime shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Step 1 of 4</p>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Workspace Details</h1>
                <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                  Set up the workspace for {managerLabel} and get your first playbook live.
                </p>
                <div className="mt-6">
                  <SessionBadge email={managerEmail} />
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/60 p-6 shadow-xl backdrop-blur-2xl md:p-10">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lime/30 to-transparent" />

                <div className="space-y-6">
                  <div>
                    <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Your Name
                    </label>
                    <Input
                      placeholder="e.g., Alex Rivera"
                      className="h-12 rounded-xl border-border/40 bg-surface/30 px-4 text-foreground outline-none transition-all focus:border-lime/50"
                      value={managerName}
                      onChange={(event) => {
                        setWorkspaceStepError(null)
                        setManagerName(event.target.value)
                      }}
                    />
                    <p className="mt-1.5 ml-1 text-xs text-muted-foreground">
                      Used across your dashboard and on invites your reps receive.
                    </p>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Workspace Name
                      </label>
                      <Input
                        className="h-12 rounded-xl border-border/40 bg-surface/30 px-4 text-foreground outline-none transition-all focus:border-lime/50"
                        value={workspaceForm.name}
                        onChange={(event) => {
                          setWorkspaceStepError(null)
                          setWorkspaceForm((prev) => ({ ...prev, name: event.target.value }))
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Company Domain
                      </label>
                      <Input
                        className="h-12 rounded-xl border-border/40 bg-surface/30 px-4 text-foreground outline-none transition-all focus:border-lime/50"
                        value={workspaceForm.domain}
                        onChange={(event) => {
                          setWorkspaceStepError(null)
                          setWorkspaceForm((prev) => ({ ...prev, domain: event.target.value }))
                        }}
                      />
                    </div>
                  </div>
                </div>

                {managerEmail ? (
                  <div className="mt-6 rounded-2xl border border-border/40 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
                    Workspace owner: <span className="text-foreground">{managerEmail}</span>
                  </div>
                ) : null}

                {workspaceStepError ? (
                  <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {workspaceStepError}
                  </div>
                ) : null}

                {onboardingError ? (
                  <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {onboardingError}
                  </div>
                ) : null}

                <div className="mt-10 flex justify-end border-t border-border/40 pt-10">
                  <Button
                    onClick={() => void handleNext()}
                    disabled={isBootstrapping}
                    className="h-12 rounded-xl bg-lime px-8 font-semibold text-lime-950 shadow-[0_0_15px_rgba(163,230,53,0.2)] transition-all hover:bg-lime/90"
                  >
                    {isBootstrapping ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {workspaceId ? "Continuing..." : "Creating workspace..."}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Continue to API Keys
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
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
              <div className="text-center">
                <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border/50 bg-background/50 px-4 py-1.5 backdrop-blur-sm">
                  <div className="pulse-live h-2 w-2 rounded-full bg-lime shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Step 2 of 4</p>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Set up your API keys &amp; integrations</h1>
                <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Connect the providers that score calls and process recordings.
                </p>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/60 p-6 shadow-xl backdrop-blur-2xl md:p-10">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lime/30 to-transparent" />

                <div className="space-y-6">
                  {isLoadingKeys ? (
                    <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-background/20 py-16 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading provider registry...
                    </div>
                  ) : (
                    <>
                      <div className="rounded-3xl border border-border/40 bg-surface/20 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Primary scoring provider</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              This provider generates the first rubric and powers live call scoring.
                            </p>
                          </div>
                          <ProviderHelp providerId={selectedPrimaryConfig.providerId} />
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
                              Provider
                            </label>
                            <Select
                              value={selections.primaryLlmProvider}
                              onValueChange={(value) => handleProviderSelectionChange("primary_llm", value)}
                            >
                              <SelectTrigger className="h-12 rounded-xl border-border/40 bg-surface/30">
                                <SelectValue placeholder="Choose a provider" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                                {providerGroups.llm.map((provider) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {provider.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
                              Default model
                            </label>
                            {(() => {
                              const models = providerOptions.primary_llm.find((p) => p.id === selectedPrimaryConfig.providerId)?.models
                              return models && models.length > 0 ? (
                                <Select
                                  value={selectedPrimaryConfig.defaultModel}
                                  onValueChange={(value) =>
                                    handleDefaultModelChange(selectedPrimaryConfig.role, selectedPrimaryConfig.providerId, value)
                                  }
                                >
                                  <SelectTrigger className="h-12 rounded-xl border-border/40 bg-surface/30">
                                    <SelectValue placeholder="Choose a model" />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                                    {models.map((model) => (
                                      <SelectItem key={model} value={model}>
                                        {model}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={selectedPrimaryConfig.defaultModel}
                                  placeholder="Enter a model id"
                                  onChange={(event) =>
                                    handleDefaultModelChange(
                                      selectedPrimaryConfig.role,
                                      selectedPrimaryConfig.providerId,
                                      event.target.value
                                    )
                                  }
                                  className="h-12 rounded-xl border-border/40 bg-surface/30"
                                />
                              )
                            })()}
                          </div>

                          {selectedPrimaryConfig.fields.map((field) => {
                            const fieldId = `${selectedPrimaryConfig.role}-${selectedPrimaryConfig.providerId}-${field.key}`
                            return (
                              <div key={fieldId} className="md:col-span-2">
                                <CredentialField
                                  field={field}
                                  fieldId={fieldId}
                                  validation={field.key === "apiKey" || field.key === "accessKey" || field.key === "webhookSigningSecret" ? keyValidation[fieldId] : undefined}
                                  isRevealed={revealedFields.has(fieldId)}
                                  onToggleReveal={() => toggleFieldReveal(fieldId)}
                                  onChange={(value) =>
                                    handleProviderFieldChange(selectedPrimaryConfig.role, selectedPrimaryConfig.providerId, field.key, value)
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-border/40 bg-surface/20 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Fallback LLM provider</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Used when the primary provider can't satisfy a request. Defaults to Anthropic if left unconfigured.
                            </p>
                          </div>
                          <ProviderHelp providerId={selectedFallbackConfig.providerId} />
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
                              Provider
                            </label>
                            <Select
                              value={selections.fallbackLlmProvider}
                              onValueChange={(value) => handleProviderSelectionChange("fallback_llm", value)}
                            >
                              <SelectTrigger className="h-12 rounded-xl border-border/40 bg-surface/30">
                                <SelectValue placeholder="Choose a provider" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                                {providerGroups.llm.map((provider) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {provider.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
                              Default model
                            </label>
                            {(() => {
                              const models = providerOptions.fallback_llm.find((p) => p.id === selectedFallbackConfig.providerId)?.models
                              return models && models.length > 0 ? (
                                <Select
                                  value={selectedFallbackConfig.defaultModel}
                                  onValueChange={(value) =>
                                    handleDefaultModelChange(selectedFallbackConfig.role, selectedFallbackConfig.providerId, value)
                                  }
                                >
                                  <SelectTrigger className="h-12 rounded-xl border-border/40 bg-surface/30">
                                    <SelectValue placeholder="Choose a model" />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                                    {models.map((model) => (
                                      <SelectItem key={model} value={model}>
                                        {model}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={selectedFallbackConfig.defaultModel}
                                  placeholder="Enter a model id"
                                  onChange={(event) =>
                                    handleDefaultModelChange(
                                      selectedFallbackConfig.role,
                                      selectedFallbackConfig.providerId,
                                      event.target.value
                                    )
                                  }
                                  className="h-12 rounded-xl border-border/40 bg-surface/30"
                                />
                              )
                            })()}
                          </div>

                          {selectedFallbackConfig.fields.map((field) => {
                            const fieldId = `${selectedFallbackConfig.role}-${selectedFallbackConfig.providerId}-${field.key}`
                            return (
                              <div key={fieldId} className="md:col-span-2">
                                <CredentialField
                                  field={field}
                                  fieldId={fieldId}
                                  validation={field.key === "apiKey" || field.key === "accessKey" || field.key === "webhookSigningSecret" ? keyValidation[fieldId] : undefined}
                                  isRevealed={revealedFields.has(fieldId)}
                                  onToggleReveal={() => toggleFieldReveal(fieldId)}
                                  onChange={(value) =>
                                    handleProviderFieldChange(selectedFallbackConfig.role, selectedFallbackConfig.providerId, field.key, value)
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-border/40 bg-surface/20 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Enrichment provider</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Required - researches the buyer's company and contact before each call is scored.
                            </p>
                          </div>
                          <ProviderHelp providerId={selectedEnrichmentConfig.providerId} />
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
                              Provider
                            </label>
                            <Select
                              value={selections.enrichmentProvider}
                              onValueChange={(value) => handleProviderSelectionChange("enrichment", value)}
                            >
                              <SelectTrigger className="h-12 rounded-xl border-border/40 bg-surface/30">
                                <SelectValue placeholder="Choose a provider" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                                {providerGroups.enrichment.map((provider) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {provider.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {selectedEnrichmentConfig.fields.map((field) => {
                            const fieldId = `${selectedEnrichmentConfig.role}-${selectedEnrichmentConfig.providerId}-${field.key}`
                            return (
                              <div key={fieldId} className="md:col-span-2">
                                <CredentialField
                                  field={field}
                                  fieldId={fieldId}
                                  validation={field.key === "apiKey" || field.key === "accessKey" || field.key === "webhookSigningSecret" ? keyValidation[fieldId] : undefined}
                                  isRevealed={revealedFields.has(fieldId)}
                                  onToggleReveal={() => toggleFieldReveal(fieldId)}
                                  onChange={(value) =>
                                    handleProviderFieldChange(selectedEnrichmentConfig.role, selectedEnrichmentConfig.providerId, field.key, value)
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Document Parsing */}
                      <div className="rounded-3xl border border-border/40 bg-surface/20 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">Document parsing provider</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Required — parses PDFs, DOCX, PPTX, images, and visual layouts into text for rubric generation.{" "}
                              <a href="https://cloud.llamaindex.ai/api-key" target="_blank" rel="noopener noreferrer" className="text-lime hover:underline">
                                Get a free key →
                              </a>{" "}
                              10k credits/month, resets monthly.
                            </p>
                          </div>
                          <ProviderHelp providerId={selectedDocumentParsingConfig.providerId} />
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
                              Provider
                            </label>
                            <Select
                              value={selections.documentParsingProvider}
                              onValueChange={(value) => handleProviderSelectionChange("document_parsing", value)}
                            >
                              <SelectTrigger className="h-12 rounded-xl border-border/40 bg-surface/30">
                                <SelectValue placeholder="Choose a provider" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/40 bg-card/95 backdrop-blur-xl">
                                {providerGroups.document_parsing.map((provider) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {provider.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {selectedDocumentParsingConfig.fields.map((field) => {
                            const fieldId = `${selectedDocumentParsingConfig.role}-${selectedDocumentParsingConfig.providerId}-${field.key}`
                            return (
                              <div key={fieldId} className="md:col-span-2">
                                <CredentialField
                                  field={field}
                                  fieldId={fieldId}
                                  validation={field.key === "apiKey" || field.key === "accessKey" ? keyValidation[fieldId] : undefined}
                                  isRevealed={revealedFields.has(fieldId)}
                                  onToggleReveal={() => toggleFieldReveal(fieldId)}
                                  onChange={(value) =>
                                    handleProviderFieldChange(selectedDocumentParsingConfig.role, selectedDocumentParsingConfig.providerId, field.key, value)
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>

                    </>
                  )}
                </div>

                {keysStepError ? (
                  <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {keysStepError}
                  </div>
                ) : null}

                <div className="mt-10 flex items-center justify-between border-t border-border/40 pt-10">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCreatedPlaybook(null)
                      setStep(4)
                    }}
                    className="text-muted-foreground"
                  >
                    Skip API key setup
                  </Button>
                  <Button
                    onClick={() => void persistProviderSettings(true)}
                    disabled={isLoadingKeys || isSavingKeys}
                    className="h-12 rounded-xl bg-lime px-8 font-semibold text-lime-950 shadow-[0_0_15px_rgba(163,230,53,0.2)] transition-all hover:bg-lime/90"
                  >
                    {isSavingKeys ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Save & Continue
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
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
              className="flex w-full justify-center pb-20"
            >
              <div className="w-full max-w-4xl space-y-6">
                <div className="flex items-center justify-between gap-4 rounded-3xl border border-border/40 bg-card/40 px-6 py-4 backdrop-blur-xl">
                  <div>
                    <p className="text-sm font-medium text-foreground">Create your first playbook now or finish setup first.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your providers are connected, so anything you upload here will be processed for real.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCreatedPlaybook(null)
                      setStep(4)
                    }}
                    className="shrink-0 text-muted-foreground"
                  >
                    Skip for now
                  </Button>
                </div>
                <PlaybookBuilder
                  mode="live"
                  onComplete={(result) => {
                    if (result.mode === "live") {
                      setCreatedPlaybook({ playbookId: result.playbookId, slug: result.slug })
                    }
                    setStep(4)
                  }}
                  submitLabel="Save & Continue to Invites"
                />
              </div>
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
              className="space-y-8"
            >
              <div className="text-center">
                <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border/50 bg-background/50 px-4 py-1.5 backdrop-blur-sm">
                  <div className="pulse-live h-2 w-2 rounded-full bg-lime shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Step 4 of 4</p>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Invite your team</h1>
                <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                  Invite reps now and they will receive an email that routes them into rep onboarding with workspace access already attached.
                </p>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/60 p-6 shadow-xl backdrop-blur-2xl md:p-10">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lime/30 to-transparent" />

                <div className="space-y-4">
                  {createdPlaybook ? (
                    <div className="rounded-2xl border border-lime/20 bg-lime/5 px-4 py-3 text-sm text-lime">
                      Playbook saved and processing in the background.
                    </div>
                  ) : null}

                  {onboardingError ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                      {onboardingError}
                    </div>
                  ) : null}

                  {invites.map((email, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex-1">
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => handleInviteChange(idx, e.target.value)}
                          className="h-12 rounded-xl border-border/40 bg-surface/30 px-4 text-foreground outline-none transition-all focus:border-lime/50"
                          placeholder={`rep${idx + 1}@company.com`}
                        />
                      </div>
                    </div>
                  ))}

                  <Button variant="ghost" onClick={handleAddInvite} className="text-lime transition-colors hover:bg-lime/10 hover:text-lime/80">
                    + Add another email
                  </Button>
                </div>

                <div className="mt-10 flex items-center justify-between border-t border-border/40 pt-10">
                  <Button
                    variant="ghost"
                    onClick={finishOnboarding}
                    disabled={isFinishing}
                    className="text-muted-foreground"
                  >
                    Skip & go to Dashboard
                  </Button>
                  <Button
                    onClick={finishOnboarding}
                    disabled={isFinishing}
                    className="relative overflow-hidden rounded-xl bg-lime px-8 font-semibold text-lime-950 shadow-[0_0_15px_rgba(163,230,53,0.2)] transition-all hover:bg-lime/90 h-12"
                  >
                    {isFinishing ? (
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 animate-pulse" />
                        Entering Dashboard...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Send Invites & Finish
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
