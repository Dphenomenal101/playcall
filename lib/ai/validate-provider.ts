import { OPENAI_COMPATIBLE_BASE_URLS, type PlaycallProvider } from "./providers"

export interface ProviderKeyValidation {
  valid: boolean
  message?: string
}

async function validateOpenAI(apiKey: string): Promise<ProviderKeyValidation> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (response.ok) return { valid: true }
    if (response.status === 401) return { valid: false, message: "Invalid API key" }
    return { valid: false, message: `Unexpected response (${response.status})` }
  } catch {
    return { valid: false, message: "Unable to reach OpenAI" }
  }
}

async function validateAnthropic(apiKey: string): Promise<ProviderKeyValidation> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    })
    if (response.ok) return { valid: true }
    if (response.status === 401) return { valid: false, message: "Invalid API key" }
    return { valid: false, message: `Unexpected response (${response.status})` }
  } catch {
    return { valid: false, message: "Unable to reach Anthropic" }
  }
}

async function validateOpenAICompatible(providerId: PlaycallProvider, apiKey: string): Promise<ProviderKeyValidation> {
  const baseUrl = OPENAI_COMPATIBLE_BASE_URLS[providerId]
  if (!baseUrl) {
    return { valid: false, message: "Validation not supported for this provider" }
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (response.ok) return { valid: true }
    if (response.status === 401 || response.status === 403) return { valid: false, message: "Invalid API key" }
    return { valid: false, message: `Unexpected response (${response.status})` }
  } catch {
    return { valid: false, message: "Unable to reach provider" }
  }
}

async function validateExa(apiKey: string): Promise<ProviderKeyValidation> {
  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "connection test", numResults: 1 }),
    })
    if (response.ok) return { valid: true }
    if (response.status === 401 || response.status === 403) return { valid: false, message: "Invalid API key" }
    return { valid: false, message: `Unexpected response (${response.status})` }
  } catch {
    return { valid: false, message: "Unable to reach Exa" }
  }
}

async function validateLlamaParse(apiKey: string): Promise<ProviderKeyValidation> {
  try {
    const response = await fetch("https://api.cloud.llamaindex.ai/api/v2/parse", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (response.ok || response.status === 400) return { valid: true }
    if (response.status === 401 || response.status === 403) return { valid: false, message: "Invalid API key" }
    return { valid: false, message: `Unexpected response (${response.status})` }
  } catch {
    return { valid: false, message: "Unable to reach LlamaParse" }
  }
}

export async function validateProviderApiKey(
  providerId: string,
  apiKey: string,
  extra?: { baseUrl?: string }
): Promise<ProviderKeyValidation> {
  if (!apiKey.trim()) {
    return { valid: false, message: "API key is required" }
  }

  if (providerId === "openai") return validateOpenAI(apiKey)
  if (providerId === "anthropic") return validateAnthropic(apiKey)
  if (providerId === "exa") return validateExa(apiKey)
  if (providerId === "llamaparse") return validateLlamaParse(apiKey)
  if (providerId in OPENAI_COMPATIBLE_BASE_URLS) {
    return validateOpenAICompatible(providerId as PlaycallProvider, apiKey)
  }

  return { valid: false, message: "Validation not supported for this provider" }
}
