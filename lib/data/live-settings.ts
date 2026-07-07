import { createAdminClient } from "@/lib/supabase/admin"
import { decryptWorkspaceSecret, encryptWorkspaceSecret } from "@/lib/security/encryption"
import { getProviderRegistryEntry, getProvidersForRole, isProviderRuntimeSupported, type ProviderRegistryEntry } from "@/lib/ai/provider-registry"

type WorkspaceProviderRole = "primary_llm" | "fallback_llm" | "enrichment" | "document_parsing"

export interface WorkspaceSettingsResponse {
  workspaceName: string
  companyDomain: string
  email: string
  fullName: string
  providers: {
    llm: ProviderRegistryEntry[]
    enrichment: ProviderRegistryEntry[]
    document_parsing: ProviderRegistryEntry[]
  }
  selections: {
    primaryLlmProvider: string
    fallbackLlmProvider: string
    enrichmentProvider: string
    documentParsingProvider: string
  }
  providerConfigs: Array<{
    providerId: string
    role: WorkspaceProviderRole
    enabled: boolean
    defaultModel: string
    metadata: Record<string, unknown>
    fields: Array<{
      key: string
      label: string
      kind: string
      placeholder?: string
      required?: boolean
      helperText?: string
      value: string
      configured: boolean
    }>
  }>
}

function toSafeString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function maskSecret(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return ""
  }

  const trimmed = value.trim()
  if (trimmed.length <= 8) {
    return "••••••••"
  }

  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

function buildProviderConfigRow(input: {
  role: WorkspaceProviderRole
  providerId: string
  enabled: boolean
  defaultModel: string
  metadata?: Record<string, unknown>
  credentials?: Record<string, unknown>
}) {
  const provider = getProviderRegistryEntry(input.providerId)
  if (!provider) {
    return null
  }

  return {
    providerId: provider.id,
    role: input.role,
    enabled: input.enabled,
    defaultModel: input.defaultModel,
    metadata: input.metadata ?? {},
    fields: provider.credentialFields.map((field) => {
      const rawValue = input.credentials?.[field.key]
      const maskedValue = field.kind === "secret" || field.kind === "apiKey" ? maskSecret(rawValue) : ""
      return {
        ...field,
        value: field.kind === "secret" || field.kind === "apiKey" ? "" : toSafeString(rawValue),
        placeholder:
          field.kind === "secret" || field.kind === "apiKey"
            ? maskedValue || field.placeholder
            : field.placeholder,
        configured: Boolean(typeof rawValue === "string" ? rawValue.trim() : rawValue),
      }
    }),
  }
}

export async function getWorkspaceSettings(workspaceId: string, viewer: { id: string; email: string | null }) {
  const admin = createAdminClient()
  const [{ data: workspace, error: workspaceError }, { data: providerRows, error: providerError }, { data: credentialRows }, { data: profile }] =
    await Promise.all([
      admin.from("workspaces").select("name, company_domain").eq("id", workspaceId).maybeSingle(),
      admin
        .from("workspace_provider_settings")
        .select("provider_type, role, selected_default_model, enabled, metadata")
        .eq("workspace_id", workspaceId),
      admin
        .from("workspace_provider_credentials")
        .select("provider_id, encrypted_credentials")
        .eq("workspace_id", workspaceId),
      admin.from("profiles").select("full_name").eq("id", viewer.id).maybeSingle(),
    ])

  if (workspaceError) {
    throw workspaceError
  }

  if (providerError) {
    throw providerError
  }

  const rows = providerRows ?? []
  const rowByRole = new Map(rows.map((row) => [row.role as WorkspaceProviderRole, row]))
  const credsByProvider = new Map(
    (credentialRows ?? []).map((row) => [
      row.provider_id,
      decryptWorkspaceSecret((row.encrypted_credentials as Record<string, unknown> | null) ?? {}),
    ])
  )

  const rawPrimaryProvider = rowByRole.get("primary_llm")?.provider_type ?? "openai"
  const rawFallbackProvider = rowByRole.get("fallback_llm")?.provider_type ?? "anthropic"
  const primaryProvider = isProviderRuntimeSupported(rawPrimaryProvider) ? rawPrimaryProvider : "openai"
  const fallbackProvider = isProviderRuntimeSupported(rawFallbackProvider) ? rawFallbackProvider : "anthropic"
  const enrichmentProvider = rowByRole.get("enrichment")?.provider_type ?? "exa"
  const documentParsingProvider = rowByRole.get("document_parsing")?.provider_type ?? "llamaparse"

  const providerConfigs = rows
    .map((row) =>
      buildProviderConfigRow({
        role: row.role as WorkspaceProviderRole,
        providerId: row.provider_type,
        enabled: Boolean(row.enabled),
        defaultModel: row.selected_default_model ?? "",
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
        credentials: credsByProvider.get(row.provider_type) ?? {},
      })
    )
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => isProviderRuntimeSupported(row.providerId))

  return {
    workspaceName: workspace?.name ?? "",
    companyDomain: workspace?.company_domain ?? "",
    email: viewer.email ?? "",
    fullName: profile?.full_name ?? "",
    providers: {
      llm: getProvidersForRole("llm"),
      enrichment: getProvidersForRole("enrichment"),
      document_parsing: getProvidersForRole("document_parsing"),
    },
    selections: {
      primaryLlmProvider: primaryProvider,
      fallbackLlmProvider: fallbackProvider,
      enrichmentProvider,
      documentParsingProvider,
    },
    providerConfigs,
  } satisfies WorkspaceSettingsResponse
}

export async function saveWorkspaceSettings(input: {
  workspaceId: string
  userId: string
  fullName: string
  workspaceName: string
  companyDomain: string
  selections: {
    primaryLlmProvider: string
    fallbackLlmProvider: string
    enrichmentProvider: string
    documentParsingProvider: string
  }
  providerConfigs: Array<{
    providerId: string
    role: WorkspaceProviderRole
    enabled: boolean
    defaultModel: string
    metadata?: Record<string, unknown>
    credentials?: Record<string, unknown>
  }>
}) {
  const admin = createAdminClient()
  for (const providerId of [
    input.selections.primaryLlmProvider,
    input.selections.fallbackLlmProvider,
    input.selections.enrichmentProvider,
    input.selections.documentParsingProvider,
  ]) {
    if (!isProviderRuntimeSupported(providerId)) {
      throw new Error(`Provider ${providerId} is not enabled in the current runtime`)
    }
  }

  const { data: existingCredRows, error: existingCredRowsError } = await admin
    .from("workspace_provider_credentials")
    .select("provider_id, encrypted_credentials")
    .eq("workspace_id", input.workspaceId)

  if (existingCredRowsError) {
    throw existingCredRowsError
  }

  const existingSecretsByProvider = new Map(
    (existingCredRows ?? []).map((row) => [
      row.provider_id,
      decryptWorkspaceSecret((row.encrypted_credentials as Record<string, unknown> | null) ?? {}),
    ])
  )

  const { error: workspaceError } = await admin
    .from("workspaces")
    .update({
      name: input.workspaceName.trim(),
      company_domain: input.companyDomain.trim().toLowerCase(),
    })
    .eq("id", input.workspaceId)

  if (workspaceError) {
    throw workspaceError
  }

  if (input.fullName.trim()) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ full_name: input.fullName.trim() })
      .eq("id", input.userId)

    if (profileError) {
      throw profileError
    }
  }

  const settingsRows: Array<Record<string, unknown>> = []
  const credentialRows: Array<Record<string, unknown>> = []

  for (const config of input.providerConfigs) {
    if (!isProviderRuntimeSupported(config.providerId)) {
      throw new Error(`Provider ${config.providerId} is not enabled in the current runtime`)
    }

    const existingSecrets = existingSecretsByProvider.get(config.providerId) ?? {}
    // Only persist keys the provider's registry entry actually declares
    // (e.g. "apiKey") - without this allowlist, a request crafted outside
    // the settings UI could stash an arbitrary extra key like "baseUrl" for
    // a provider that doesn't expose one, which createOpenAICompatibleModel
    // (lib/ai/providers.ts) would then honor at runtime - an authenticated
    // SSRF vector with the response read back into real LLM output.
    const allowedKeys = new Set(getProviderRegistryEntry(config.providerId)?.credentialFields.map((field) => field.key) ?? [])
    const mergedCredentials = {
      // Re-filtered too, so a stray disallowed key saved before this check
      // existed gets dropped on the next save instead of persisting forever.
      ...Object.fromEntries(Object.entries(existingSecrets).filter(([key]) => allowedKeys.has(key))),
      ...Object.fromEntries(
        Object.entries(config.credentials ?? {}).filter(([key, value]) => {
          if (!allowedKeys.has(key)) return false
          if (typeof value !== "string") return value !== null && typeof value !== "undefined"
          return value.trim().length > 0
        })
      ),
    }

    settingsRows.push({
      workspace_id: input.workspaceId,
      provider_type: config.providerId,
      role: config.role,
      enabled: config.enabled,
      selected_default_model: config.defaultModel.trim() || null,
      metadata: config.metadata ?? {},
      created_by: input.userId,
    })

    credentialRows.push({
      workspace_id: input.workspaceId,
      provider_id: config.providerId,
      encrypted_credentials: encryptWorkspaceSecret(mergedCredentials),
    })
  }

  if (settingsRows.length > 0) {
    const { error: providerError } = await admin.from("workspace_provider_settings").upsert(settingsRows, {
      onConflict: "workspace_id,role",
    })
    if (providerError) throw providerError
  }

  if (credentialRows.length > 0) {
    const { error: credError } = await admin.from("workspace_provider_credentials").upsert(credentialRows, {
      onConflict: "workspace_id,provider_id",
    })
    if (credError) throw credError
  }

  return getWorkspaceSettings(input.workspaceId, { id: input.userId, email: null })
}
