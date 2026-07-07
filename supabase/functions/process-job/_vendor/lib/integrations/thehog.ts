import { readRuntimeEnv } from "../runtime/env.ts"

const THEHOG_BASE_URL = "https://developer.thehog.ai"

export interface TheHogCredentials {
  accessKey: string
  secretKey: string
}

export function hasTheHogConfig(creds?: Partial<TheHogCredentials>) {
  const accessKey = creds?.accessKey ?? readRuntimeEnv("THEHOG_ACCESS_KEY")
  const secretKey = creds?.secretKey ?? readRuntimeEnv("THEHOG_SECRET_KEY")
  return Boolean(accessKey && secretKey)
}

export function getTheHogCredentials(override?: Partial<TheHogCredentials>): TheHogCredentials {
  const accessKey = override?.accessKey?.trim() ?? readRuntimeEnv("THEHOG_ACCESS_KEY")?.trim() ?? ""
  const secretKey = override?.secretKey?.trim() ?? readRuntimeEnv("THEHOG_SECRET_KEY")?.trim() ?? ""

  if (!accessKey || !secretKey) {
    throw new Error("Missing TheHog credentials (THEHOG_ACCESS_KEY / THEHOG_SECRET_KEY)")
  }

  return { accessKey, secretKey }
}

function theHogHeaders(creds: TheHogCredentials): Record<string, string> {
  return {
    "X-Access-Key": creds.accessKey,
    "X-Secret-Key": creds.secretKey,
    "Content-Type": "application/json",
  }
}

async function pollUrl(
  creds: TheHogCredentials,
  url: string,
  maxWaitMs = 30_000
): Promise<{ status: string; result: unknown; error: unknown }> {
  const deadline = Date.now() + maxWaitMs
  let delayMs = 2_000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delayMs))

    const res = await fetch(url, { headers: theHogHeaders(creds) })

    if (!res.ok) {
      throw new Error(`TheHog poll error: ${res.status}`)
    }

    const op = await res.json()
    if (op.status === "succeeded" || op.status === "partial_success") {
      return { status: op.status, result: op.result, error: op.error }
    }
    if (op.status === "failed" || op.status === "cancelled") {
      return { status: op.status, result: null, error: op.error }
    }

    delayMs = Math.min(delayMs * 1.5, 5_000)
  }

  return { status: "timeout", result: null, error: "Operation did not complete in time" }
}

function isEmptyCompanyResult(result: unknown): boolean {
  if (!result) return true
  if (Array.isArray(result) && result.length === 0) return true
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>
    if (Array.isArray(r.items) && r.items.length === 0) return true
    if (Array.isArray(r.data) && r.data.length === 0) return true
  }
  return false
}

async function webSearchCompany(creds: TheHogCredentials, query: string): Promise<unknown> {
  const res = await fetch(`${THEHOG_BASE_URL}/api/v1/platform/scrapers/web/search`, {
    method: "POST",
    headers: theHogHeaders(creds),
    body: JSON.stringify({ query: `${query} company`, maxResults: 5, searchDepth: "advanced" }),
  })

  if (!res.ok) {
    throw new Error(`TheHog web search fallback failed: ${res.status}`)
  }

  const data = await res.json()
  return { source: "web_search", results: (data.data?.results ?? []) as unknown[] }
}

export async function searchCompany(
  creds: TheHogCredentials,
  query: string,
  domain?: string
): Promise<unknown> {
  const body: Record<string, unknown> = { query, limit: 5 }
  if (domain) {
    body.filters = { company: { domains: [domain] } }
  }
  const res = await fetch(`${THEHOG_BASE_URL}/api/v1/companies/search`, {
    method: "POST",
    headers: theHogHeaders(creds),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`TheHog company search failed: ${res.status}`)
  }

  const data = await res.json()

  // Always 202 async — poll /api/operations/:id
  if (data.operationId) {
    const polled = await pollUrl(creds, `${THEHOG_BASE_URL}/api/operations/${data.operationId}`)
    if (isEmptyCompanyResult(polled.result)) {
      return webSearchCompany(creds, query)
    }
    return polled.result
  }

  if (isEmptyCompanyResult(data)) {
    return webSearchCompany(creds, query)
  }

  return data
}

export async function enrichContact(
  creds: TheHogCredentials,
  identifier: { linkedin_url?: string; email?: string }
): Promise<unknown> {
  const res = await fetch(`${THEHOG_BASE_URL}/api/enrichments`, {
    method: "POST",
    headers: theHogHeaders(creds),
    body: JSON.stringify({
      identifier,
      fields: ["contact.email", "contact.phone"],
    }),
  })

  if (!res.ok) {
    throw new Error(`TheHog enrichment failed: ${res.status}`)
  }

  const data = await res.json()

  // 200 sync → data is an array; return the first item
  if (data.data) {
    return Array.isArray(data.data) ? data.data[0] : data.data
  }

  // 202 async — use the pollUrl from the response (always /api/operations/:id, not /api/enrichments/:id)
  if (data.operationId) {
    const url = data.pollUrl
      ? (data.pollUrl.startsWith("http") ? data.pollUrl : `${THEHOG_BASE_URL}${data.pollUrl}`)
      : `${THEHOG_BASE_URL}/api/operations/${data.operationId}`
    const polled = await pollUrl(creds, url)
    // Async result wraps data in items[0].data
    const items = (polled.result as { items?: Array<{ data: unknown }> } | null)?.items
    return items?.[0]?.data ?? polled.result
  }

  return data
}
