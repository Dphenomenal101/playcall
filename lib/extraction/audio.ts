import { createAdminClient } from "../supabase/admin"
import { decryptWorkspaceSecret } from "../security/encryption"
import { readRuntimeEnv } from "../runtime/env"

// Whisper's documented hard limit
export const WHISPER_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

async function resolveOpenAiKey(workspaceId: string): Promise<string | null> {
  // Try workspace's configured primary LLM key first (likely OpenAI)
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("workspace_provider_settings")
      .select("provider_type, encrypted_credentials")
      .eq("workspace_id", workspaceId)
      .in("role", ["primary_llm", "fallback_llm"])
      .eq("provider_type", "openai")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle()

    if (data?.encrypted_credentials) {
      const credentials = decryptWorkspaceSecret(data.encrypted_credentials as Record<string, string>)
      const key = typeof credentials?.apiKey === "string" ? credentials.apiKey.trim() : ""
      if (key) return key
    }
  } catch {
    // Fall through to env var
  }

  return readRuntimeEnv("OPENAI_API_KEY")?.trim() ?? null
}

export async function transcribeAudioFromUrl(
  url: string,
  fileName: string,
  workspaceId: string
): Promise<string> {
  const apiKey = await resolveOpenAiKey(workspaceId)
  if (!apiKey) {
    throw new Error(
      "Audio transcription requires an OpenAI API key. Configure one under Settings → Integrations or set OPENAI_API_KEY in your environment."
    )
  }

  const audioResponse = await fetch(url)
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio file: ${audioResponse.status} ${audioResponse.statusText}`)
  }

  const audioBuffer = await audioResponse.arrayBuffer()

  if (audioBuffer.byteLength > WHISPER_MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Audio file is ${(audioBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB. Whisper's limit is 25 MB — please compress or trim the recording before uploading.`
    )
  }

  const ext = (fileName.split(".").pop() ?? "mp3").toLowerCase()
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",
    webm: "audio/webm",
    mp4: "video/mp4",
    mpeg: "audio/mpeg",
    mpga: "audio/mpeg",
  }

  const form = new FormData()
  form.append("file", new Blob([audioBuffer], { type: mimeTypes[ext] ?? "audio/mpeg" }), fileName)
  form.append("model", "whisper-1")
  form.append("response_format", "text")

  const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!whisperResponse.ok) {
    const errorBody = await whisperResponse.text().catch(() => "")
    throw new Error(`Whisper transcription failed (${whisperResponse.status}): ${errorBody}`)
  }

  const transcript = await whisperResponse.text()
  return transcript.trim()
}
