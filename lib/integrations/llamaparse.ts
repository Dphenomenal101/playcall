import { createHmac, timingSafeEqual } from "node:crypto"
import { getWorkspaceProviderRuntimeConfig } from "../ai/providers"
import { readRuntimeEnv } from "../runtime/env"

const LLAMA_CLOUD_BASE = "https://api.cloud.llamaindex.ai"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function getLlamaParseApiKey(workspaceId: string): Promise<string | null> {
  // Workspace BYOK key takes priority over app-level fallback, using the
  // same provider config resolution pattern as LLM/enrichment providers.
  const config = await getWorkspaceProviderRuntimeConfig(workspaceId, "document_parsing").catch(() => null)
  const workspaceKey = typeof config?.credentials?.apiKey === "string" ? config.credentials.apiKey.trim() : ""
  if (workspaceKey) return workspaceKey

  return readRuntimeEnv("LLAMA_CLOUD_API_KEY")?.trim() ?? null
}

export function getLlamaParseWebhookSecret(): string {
  return readRuntimeEnv("LLAMA_CLOUD_WEBHOOK_SECRET")?.trim() ?? ""
}

export function getLlamaParseWebhookUrl(): string {
  // LLAMA_CLOUD_WEBHOOK_URL must be the full webhook URL including path,
  // e.g. https://xxxx.ngrok-free.dev/api/webhooks/llamaparse
  // Never fall back to NEXT_PUBLIC_APP_URL — localhost isn't reachable by LlamaParse
  // and a non-empty return value here disables the polling fallback in live-write.ts.
  return readRuntimeEnv("LLAMA_CLOUD_WEBHOOK_URL")?.trim().replace(/\/+$/, "") ?? ""
}

// ---------------------------------------------------------------------------
// Upload + parse
// ---------------------------------------------------------------------------

type ParseTier = "fast" | "cost_effective" | "agentic" | "agentic_plus"

export async function submitLlamaParseJob(input: {
  blobUrl: string
  fileName: string
  workspaceId: string
  sourceDocumentId: string
  tier?: ParseTier
}): Promise<{ jobId: string } | { error: string }> {
  const apiKey = await getLlamaParseApiKey(input.workspaceId)
  if (!apiKey) {
    return { error: "LlamaParse is not configured for this workspace. Add a LLAMA_CLOUD_API_KEY environment variable or configure it under Settings." }
  }

  const body: Record<string, unknown> = {
    source_url: input.blobUrl,
    tier: input.tier ?? "cost_effective",
    version: "latest",
  }

  // Attach a per-job webhook so we get notified when parsing completes.
  // webhook_output_format "json" sends the payload as a JSON object — "string"
  // (the LlamaParse default) wraps it in quotes, breaking JSON.parse.
  const webhookUrl = getLlamaParseWebhookUrl()
  if (webhookUrl) {
    const webhookConfig: Record<string, unknown> = {
      webhook_url: webhookUrl,
      webhook_events: ["parse.success", "parse.error", "parse.partial_success"],
      webhook_output_format: "json",
    }
    const webhookSecret = getLlamaParseWebhookSecret()
    if (webhookSecret) {
      webhookConfig.webhook_signing_secret = webhookSecret
    }
    body.webhook_configurations = [webhookConfig]
  }

  const response = await fetch(`${LLAMA_CLOUD_BASE}/api/v2/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    return { error: `LlamaParse job creation failed (${response.status}): ${errorText}` }
  }

  const data = await response.json()
  const jobId = data?.job?.id ?? data?.id
  if (!jobId) {
    return { error: "LlamaParse returned no job ID" }
  }

  return { jobId }
}

// ---------------------------------------------------------------------------
// Poll for result (fallback when no webhook, e.g. local without ngrok)
// ---------------------------------------------------------------------------

export async function pollLlamaParseJobResult(
  jobId: string,
  apiKey: string,
  { maxAttempts = 40, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<{ markdown: string } | { error: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    const result = await fetchLlamaParseJobResult(jobId, apiKey)
    if ("markdown" in result) return result
    if ("error" in result) return result
    // status is pending/processing — keep polling
  }

  return { error: "LlamaParse job timed out after polling. The document may be too large or complex." }
}

// ---------------------------------------------------------------------------
// Fetch result (used by webhook handler + polling)
// ---------------------------------------------------------------------------

export async function fetchLlamaParseJobResult(
  jobId: string,
  apiKey: string
): Promise<{ markdown: string } | { pending: true } | { error: string }> {
  // markdown_full returns the whole document as one string — simpler than
  // concatenating per-page markdown, and recommended by the docs for LLM pipelines.
  const response = await fetch(
    `${LLAMA_CLOUD_BASE}/api/v2/parse/${encodeURIComponent(jobId)}?expand=markdown_full`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  )

  if (!response.ok) {
    return { error: `LlamaParse result fetch failed (${response.status})` }
  }

  const data = await response.json()
  // LlamaParse v2 returns status as uppercase ("COMPLETED", "PENDING", "ERROR")
  const status = (data?.job?.status ?? data?.status ?? "").toUpperCase()

  if (status === "PENDING" || status === "PROCESSING" || status === "") {
    return { pending: true }
  }

  if (status === "ERROR" || status === "FAILED") {
    return { error: data?.job?.error_message ?? data?.error_message ?? "LlamaParse job failed" }
  }

  // markdown_full is a single string for the whole document
  const markdown = (typeof data?.markdown_full === "string" ? data.markdown_full : "").trim()

  if (!markdown) {
    return { error: "LlamaParse returned empty content" }
  }

  return { markdown }
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

export function verifyLlamaParseWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!secret || !signatureHeader) {
    return false
  }

  // LC-Signature header format: "sha256=<hex>"
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex")
  const received = signatureHeader.trim()

  if (expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}
