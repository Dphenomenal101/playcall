"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Save, Eye, EyeOff, ExternalLink } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { clearLiveResourceCache } from "@/hooks/use-demo-live-resource"
import { cn } from "@/lib/utils"
import { getProviderRegistryEntry } from "@/lib/ai/provider-registry"

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

export type SettingsResponse = {
  workspaceName: string
  companyDomain: string
  email: string
  fullName: string
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

export const demoSettings: SettingsResponse = {
  workspaceName: "Playcall Revenue Team",
  companyDomain: "playcall.ai",
  email: "ops@playcall.ai",
  fullName: "Sales Manager",
  providers: {
    llm: [
      { id: "openai", label: "OpenAI", defaultModel: "gpt-5-mini", models: ["gpt-5.5", "gpt-5.4", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini", "gpt-4o"] },
      { id: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-6", models: ["claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"] },
      { id: "google", label: "Google Generative AI", defaultModel: "gemini-3.5-flash", models: ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"] },
    ],
    enrichment: [{ id: "exa", label: "Exa" }],
    document_parsing: [{ id: "llamaparse", label: "LlamaParse" }],
  },
  selections: {
    primaryLlmProvider: "openai",
    fallbackLlmProvider: "anthropic",
    enrichmentProvider: "exa",
    documentParsingProvider: "llamaparse",
  },
  providerConfigs: [
    {
      providerId: "openai",
      role: "primary_llm" as const,
      enabled: true,
      defaultModel: "gpt-5-mini",
      metadata: {},
      fields: [{ key: "apiKey", label: "OpenAI API key", kind: "secret", value: "sk-li••••••••", configured: true }],
    },
    {
      providerId: "anthropic",
      role: "fallback_llm" as const,
      enabled: true,
      defaultModel: "claude-sonnet-4-6",
      metadata: {},
      fields: [{ key: "apiKey", label: "Anthropic API key", kind: "secret", value: "sk-an••••••••", configured: true }],
    },
    {
      providerId: "exa",
      role: "enrichment" as const,
      enabled: true,
      defaultModel: "",
      metadata: {},
      fields: [{ key: "apiKey", label: "Exa API key", kind: "secret", value: "exa_••••••••", configured: true }],
    },
    {
      providerId: "llamaparse",
      role: "document_parsing" as const,
      enabled: true,
      defaultModel: "",
      metadata: {},
      fields: [{ key: "apiKey", label: "LlamaParse API key", kind: "secret", value: "llx-••••••••", configured: true }],
    },
  ],
}

function buildLlmSnapshot(
  selections: { primaryLlmProvider: string; fallbackLlmProvider: string },
  configs: ProviderConfig[]
) {
  return JSON.stringify({
    primary: selections.primaryLlmProvider,
    fallback: selections.fallbackLlmProvider,
    configs: configs
      .filter((config) => config.role === "primary_llm" || config.role === "fallback_llm")
      .map((config) => ({
        providerId: config.providerId,
        defaultModel: config.defaultModel,
        fields: config.fields.map((field) => ({ key: field.key, value: field.value })),
      })),
  })
}

function buildEnrichmentSnapshot(
  selections: { enrichmentProvider: string; documentParsingProvider: string },
  configs: ProviderConfig[]
) {
  return JSON.stringify({
    enrichment: selections.enrichmentProvider,
    documentParsing: selections.documentParsingProvider,
    configs: configs
      .filter((config) => config.role === "enrichment" || config.role === "document_parsing")
      .map((config) => ({
        providerId: config.providerId,
        defaultModel: config.defaultModel,
        fields: config.fields.map((field) => ({ key: field.key, value: field.value })),
      })),
  })
}

function SettingsPageInner({ initialSettings, isDemoMode }: { initialSettings: SettingsResponse; isDemoMode: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    workspaceName: initialSettings.workspaceName,
    companyDomain: initialSettings.companyDomain,
    email: initialSettings.email,
    fullName: initialSettings.fullName,
  })
  const [selections, setSelections] = useState(initialSettings.selections)
  const [providerGroups, setProviderGroups] = useState(initialSettings.providers)
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>(initialSettings.providerConfigs)
  const [isSaving, setIsSaving] = useState(false)
  const [savingSection, setSavingSection] = useState<"workspace" | "llm" | "enrichment" | null>(null)
  const [isLoading] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false)
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())

  const [workspaceBaseline, setWorkspaceBaseline] = useState({
    workspaceName: initialSettings.workspaceName,
    companyDomain: initialSettings.companyDomain,
    fullName: initialSettings.fullName,
  })
  const [llmBaseline, setLlmBaseline] = useState(() => buildLlmSnapshot(initialSettings.selections, initialSettings.providerConfigs))
  const [enrichmentBaseline, setEnrichmentBaseline] = useState(() =>
    buildEnrichmentSnapshot(initialSettings.selections, initialSettings.providerConfigs)
  )
  const [baselineResetToken, setBaselineResetToken] = useState(0)
  const [keyValidation, setKeyValidation] = useState<
    Record<string, { status: "checking" | "valid" | "invalid"; message?: string }>
  >({})

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

  const providerOptions = useMemo(
    () => ({
      primary_llm: providerGroups.llm,
      fallback_llm: providerGroups.llm,
      enrichment: providerGroups.enrichment,
      document_parsing: providerGroups.document_parsing,
    }),
    [providerGroups]
  )

  const selectedConfigByRole = useMemo(() => {
    const roleToSelection: Record<ProviderConfig["role"], string> = {
      primary_llm: selections.primaryLlmProvider,
      fallback_llm: selections.fallbackLlmProvider,
      enrichment: selections.enrichmentProvider,
      document_parsing: selections.documentParsingProvider,
    }

    return (["primary_llm", "fallback_llm", "enrichment", "document_parsing"] as const).map((role) => {
      const configured = providerConfigs.find((config) => config.role === role && config.providerId === roleToSelection[role])
      if (configured) {
        return configured
      }

      const option = providerOptions[role].find((entry: ProviderOption) => entry.id === roleToSelection[role])
      return {
        providerId: roleToSelection[role],
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
    })
  }, [providerConfigs, providerOptions, selections])

  // selectedConfigByRole fills in synthesized defaults for never-configured
  // roles, so it's the only shape that's safe to diff against for "has this
  // section actually changed" - comparing raw providerConfigs would treat an
  // unconfigured role as different from itself depending on whether a row
  // exists yet. Re-synced via baselineResetToken right after a load/save
  // completes, reading the latest value through a ref since effects run
  // after the render where selectedConfigByRole was freshly recomputed.
  const selectedConfigByRoleRef = useRef(selectedConfigByRole)
  selectedConfigByRoleRef.current = selectedConfigByRole

  useEffect(() => {
    setLlmBaseline(buildLlmSnapshot(selections, selectedConfigByRoleRef.current))
    setEnrichmentBaseline(buildEnrichmentSnapshot(selections, selectedConfigByRoleRef.current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineResetToken])

  const hasWorkspaceChanges =
    formData.workspaceName !== workspaceBaseline.workspaceName ||
    formData.companyDomain !== workspaceBaseline.companyDomain ||
    formData.fullName !== workspaceBaseline.fullName
  const hasLlmChanges = buildLlmSnapshot(selections, selectedConfigByRole) !== llmBaseline
  const hasEnrichmentChanges = buildEnrichmentSnapshot(selections, selectedConfigByRole) !== enrichmentBaseline

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleProviderSelectionChange = (
    role: "primary_llm" | "fallback_llm" | "enrichment" | "document_parsing",
    providerId: string
  ) => {
    setSelections((current) => {
      if (role === "primary_llm") {
        return { ...current, primaryLlmProvider: providerId }
      }
      if (role === "fallback_llm") {
        return { ...current, fallbackLlmProvider: providerId }
      }
      if (role === "enrichment") return { ...current, enrichmentProvider: providerId }
      return { ...current, documentParsingProvider: providerId }
    })
  }

  const handleProviderFieldChange = (
    role: ProviderConfig["role"],
    providerId: string,
    fieldKey: string,
    value: string
  ) => {
    if (fieldKey === "apiKey") {
      const fieldId = `${role}-${providerId}-apiKey`
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
        const allFields = (option?.credentialFields ?? []).map((f) => ({
          ...f,
          value: f.key === fieldKey ? value : "",
          configured: f.key === fieldKey ? Boolean(value.trim()) : false,
        }))
        return [
          ...current,
          {
            providerId,
            role,
            enabled: true,
            defaultModel: option?.defaultModel ?? "",
            metadata: {},
            fields: allFields.length > 0 ? allFields : [{ key: fieldKey, label: fieldKey, kind: "text", value, configured: Boolean(value.trim()) }],
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
    setProviderConfigs((current) =>
      current.map((config) =>
        config.role === role && config.providerId === providerId ? { ...config, defaultModel: value } : config
      )
    )
  }

  const validateChangedApiKeys = async (roles: ProviderConfig["role"][]) => {
    const configsToCheck = selectedConfigByRole.filter((config) => roles.includes(config.role))
    const checks: Array<{ fieldId: string; providerId: string; fieldKey: string; apiKey: string; secretKey?: string; webhookSecret?: string; baseUrl?: string }> = []

    for (const config of configsToCheck) {
      const apiKeyField = config.fields.find((field) => field.key === "apiKey")
      const accessKeyField = config.fields.find((field) => field.key === "accessKey")
      const secretKeyField = config.fields.find((field) => field.key === "secretKey")
      const baseUrlField = config.fields.find((field) => field.key === "baseUrl")

      // An empty value means the user didn't retype the field - the
      // previously-saved one (which we never send back to the client) is
      // still in effect, so there's nothing new to validate.
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
      toast({
        title: "Validation failed",
        description: invalid.map((result) => `${result.providerId}: ${result.message ?? "Invalid"}`).join(" "),
        variant: "destructive",
      })
      return false
    }

    return true
  }

  const handleSave = async (section: "workspace" | "llm" | "enrichment") => {
    if (isDemoMode) {
      toast({
        title: "Demo mode",
        description: "Workspace settings are read-only while demo data is active.",
      })
      return
    }

    setIsSaving(true)
    setSavingSection(section)

    try {
      if (section === "llm" || section === "enrichment") {
        const roles: ProviderConfig["role"][] =
          section === "llm" ? ["primary_llm", "fallback_llm"] : ["enrichment", "document_parsing"]
        const allKeysValid = await validateChangedApiKeys(roles)
        if (!allKeysValid) {
          return
        }
      }

      const response = await fetch("/api/live/manager/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          selections,
          providerConfigs: selectedConfigByRole.map((config) => ({
            providerId: config.providerId,
            role: config.role,
            enabled: config.enabled,
            defaultModel: config.defaultModel,
            metadata: config.metadata,
            credentials: Object.fromEntries(config.fields.map((field) => [field.key, field.value])),
          })),
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save settings")
      }

      setWorkspaceBaseline({
        workspaceName: payload.workspaceName ?? formData.workspaceName,
        companyDomain: payload.companyDomain ?? formData.companyDomain,
        fullName: payload.fullName ?? formData.fullName,
      })
      setSelections(payload.selections ?? selections)
      setProviderConfigs(payload.providerConfigs ?? providerConfigs)
      setBaselineResetToken((value) => value + 1)
      toast({
        title: "Settings saved",
        description: "Workspace identity and provider routing are up to date.",
      })
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      setSavingSection(null)
    }
  }

  const handleDeleteWorkspace = async () => {
    setIsDeletingWorkspace(true)

    try {
      const response = await fetch("/api/live/manager/workspace", {
        method: "DELETE",
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Unable to delete workspace.")
      }

      const supabase = createClient()
      await supabase.auth.signOut()
      clearLiveResourceCache()
      setIsDeleteOpen(false)
      toast({
        title: "Workspace deleted",
        description: "Your workspace was removed. You can start onboarding again.",
      })
      // See sign-out-button.tsx - /auth auto-finalizes any resolvable
      // session on mount, which would otherwise bounce straight back in.
      router.replace("/auth?signedOut=1")
      router.refresh()
    } catch (error) {
      toast({
        title: "Unable to delete workspace",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeletingWorkspace(false)
    }
  }

  const renderProviderCard = (config: (typeof selectedConfigByRole)[number]) => {
    const registryEntry = getProviderRegistryEntry(config.providerId)
    return (
    <div key={`${config.role}-${config.providerId}`} className="rounded-2xl border border-border/40 bg-surface/30 p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground/90">
            {config.role === "primary_llm"
              ? "Primary LLM"
              : config.role === "fallback_llm"
                ? "Fallback LLM"
                : config.role === "enrichment"
                  ? "Enrichment"
                  : "Document Parsing"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {config.role === "primary_llm" && "Primary scoring and rubric generation provider"}
            {config.role === "fallback_llm" && "Fallback provider when the primary model cannot satisfy the workflow"}
            {config.role === "enrichment" && "Provider used for buyer and account context enrichment"}
            {config.role === "document_parsing" && "Parses PDFs, DOCX, PPTX, images, and complex visual layouts into text for rubric generation"}
          </p>
        </div>
        <select
          value={config.providerId}
          onChange={(event) => handleProviderSelectionChange(config.role, event.target.value)}
          className="h-11 min-w-[220px] rounded-xl border border-border/40 bg-surface/50 px-3 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none"
        >
          {providerOptions[config.role].map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {config.role === "primary_llm" || config.role === "fallback_llm" ? (
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">Model</label>
            {(() => {
              const models = providerOptions[config.role].find((p) => p.id === config.providerId)?.models
              return models && models.length > 0 ? (
                <select
                  value={config.defaultModel}
                  onChange={(event) => handleDefaultModelChange(config.role, config.providerId, event.target.value)}
                  className="h-11 w-full rounded-xl border border-border/40 bg-surface/50 px-3 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none"
                >
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={config.defaultModel}
                  onChange={(event) => handleDefaultModelChange(config.role, config.providerId, event.target.value)}
                  placeholder="Enter a model id"
                  className="h-11 rounded-xl bg-surface/50 border-border/40"
                />
              )
            })()}
          </div>
        ) : null}

        {config.fields.map((field) => {
          const isSecret = field.kind === "secret" || field.kind === "apiKey"
          const fieldId = `${config.role}-${config.providerId}-${field.key}`
          const isRevealed = revealedFields.has(fieldId)

          return (
            <div key={fieldId}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                  {field.label}
                </label>
              </div>
              <div className="relative">
                <Input
                  type={isSecret && !isRevealed ? "password" : "text"}
                  autoComplete={isSecret ? "new-password" : "off"}
                  value={field.value}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    handleProviderFieldChange(config.role, config.providerId, field.key, event.target.value)
                  }
                  className={cn("h-11 rounded-xl bg-surface/50 border-border/40", isSecret && field.value && "pr-10")}
                />
                {isSecret && field.value ? (
                  <button
                    type="button"
                    onClick={() => toggleFieldReveal(fieldId)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={isRevealed ? "Hide value" : "Show value"}
                  >
                    {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                ) : null}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                {(field.key === "apiKey" || field.key === "accessKey" || field.key === "webhookSigningSecret") && keyValidation[fieldId] ? (
                  <p
                    className={cn(
                      "text-[11px] font-medium",
                      keyValidation[fieldId].status === "checking" && "text-muted-foreground",
                      keyValidation[fieldId].status === "valid" && "text-lime",
                      keyValidation[fieldId].status === "invalid" && "text-rose-400"
                    )}
                  >
                    {keyValidation[fieldId].status === "checking"
                      ? "Checking..."
                      : keyValidation[fieldId].status === "valid"
                        ? "Valid"
                        : `Invalid - ${keyValidation[fieldId].message ?? "key rejected"}`}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {field.configured
                      ? isSecret
                        ? "Configured - saved key is hidden, type a new one to replace it"
                        : "Configured"
                      : field.helperText
                        ? field.helperText
                        : field.required
                          ? "Required"
                          : "Optional"}
                  </p>
                )}
                {(field.key === "apiKey" || field.key === "accessKey") && registryEntry?.apiKeyUrl && (
                  <a
                    href={registryEntry.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors group shrink-0"
                  >
                    Get your key <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6 md:mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-lime pulse-live" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
              Configuration
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Workspace Settings</h1>
        </div>
      </div>

      <div className="space-y-6 max-w-4xl">
        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-lg font-semibold mb-5 text-foreground/90">Workspace</h2>
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium block mb-2 text-foreground/80">Workspace Admin Name</label>
              <Input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="e.g., Alex Rivera"
                className="h-12 rounded-xl border border-border/40 bg-surface/30 px-4 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Used across your dashboard and on invites your reps receive.</p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2 text-foreground/80">Workspace Name</label>
              <Input
                type="text"
                name="workspaceName"
                value={formData.workspaceName}
                onChange={handleChange}
                className="h-12 rounded-xl border border-border/40 bg-surface/30 px-4 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2 text-foreground/80">Company Domain</label>
              <Input
                type="text"
                name="companyDomain"
                value={formData.companyDomain}
                onChange={handleChange}
                placeholder="company.com"
                className="h-12 rounded-xl border border-border/40 bg-surface/30 px-4 text-sm focus:border-lime/50 focus:ring-1 focus:ring-lime/50 transition-all outline-none"
              />
            </div>
            <div className="pt-2">
              <Button
                onClick={() => handleSave("workspace")}
                disabled={isLoading || isSaving || !hasWorkspaceChanges}
                className="gap-2 rounded-xl bg-lime px-6 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingSection === "workspace" ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-lg font-semibold mb-5 text-foreground/90">Auth & Access</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2 text-foreground/80">Workspace Admin Email</label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                disabled
                className="h-12 rounded-xl border border-border/40 bg-surface/20 px-4 text-sm text-muted-foreground outline-none"
              />
            </div>
            <div className="rounded-xl border border-border/40 bg-surface/30 p-4">
              <p className="font-medium text-foreground/90">Passwordless sign-in</p>
              <p className="mt-1 text-sm text-muted-foreground">Magic link and one-time code, no passwords.</p>
            </div>
            <div className="pt-2 flex gap-3 flex-wrap">
              <SignOutButton
                variant="outline"
                className="rounded-xl border-destructive/20 bg-destructive/5 px-6 text-sm font-medium text-destructive backdrop-blur-sm transition-colors hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive"
              />
              <Button
                variant="outline"
                onClick={() => setIsDeleteOpen(true)}
                className="rounded-xl border-destructive/20 bg-destructive/5 px-6 text-sm font-medium text-destructive backdrop-blur-sm transition-colors hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive"
              >
                Delete Workspace
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-lg font-semibold mb-5 text-foreground/90">LLM / Model Providers</h2>
          <div className="space-y-4">
            {selectedConfigByRole
              .filter((config) => config.role === "primary_llm" || config.role === "fallback_llm")
              .map(renderProviderCard)}
            <div className="pt-2">
              <Button
                onClick={() => handleSave("llm")}
                disabled={isLoading || isSaving || !hasLlmChanges}
                className="gap-2 rounded-xl bg-lime px-6 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingSection === "llm" ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-lg font-semibold mb-5 text-foreground/90">Integrations</h2>
          <div className="space-y-4">
            {selectedConfigByRole
              .filter((config) => config.role === "enrichment" || config.role === "document_parsing")
              .map(renderProviderCard)}
            <div className="pt-2">
              <Button
                onClick={() => handleSave("enrichment")}
                disabled={isLoading || isSaving || !hasEnrichmentChanges}
                className="gap-2 rounded-xl bg-lime px-6 hover:bg-lime/90 text-lime-950 font-semibold shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingSection === "enrichment" ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="rounded-3xl border-border/40 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the workspace, calls, playbooks, provider settings, and uploaded artifacts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkspace}
              disabled={isDeletingWorkspace}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingWorkspace ? "Deleting..." : "Delete workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function SettingsPageClient({ initialSettings, isDemoMode }: { initialSettings: SettingsResponse; isDemoMode: boolean }) {
  return (
    <DashboardLayout>
      <SettingsPageInner initialSettings={initialSettings} isDemoMode={isDemoMode} />
    </DashboardLayout>
  )
}
