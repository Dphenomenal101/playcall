// Translates raw processing errors (provider API errors, Ragie ingestion
// errors, our own internal exceptions) into short, rep/manager-facing text.
// Raw errors can contain SDK stack traces, provider-specific jargon, or
// internal implementation details - none of that should ever reach the UI
// verbatim, so every category below ends in a plain-language sentence with
// no technical terms, and anything unrecognized falls through to a generic
// message instead of being shown as-is.
const CATEGORIES: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /not configured for this workspace/i,
    message: "An integration required to process this call isn't configured for this workspace. Ask your workspace admin to check Settings.",
  },
  {
    pattern: /original file .* never stored|wasn't persisted|hasn't been persisted/i,
    message: "The original recording or transcript wasn't saved for retry. Resubmit this call with the file again.",
  },
  {
    pattern: /unsupported (file|format)|could not (parse|extract)|invalid (pdf|file|document)|corrupt/i,
    message: "We couldn't read the uploaded file. Try a different format or re-export it, then resubmit.",
  },
  {
    pattern: /exceeds.*size|too large|file size|payload too large/i,
    message: "The file is too large to process. Try a shorter clip or a more compressed format.",
  },
  {
    pattern: /timed out|timeout/i,
    message: "Processing took too long and timed out. Try retrying, or use a shorter recording.",
  },
  {
    pattern: /response_format|json_schema|model does not support|unsupported_model/i,
    message: "Scoring couldn't complete because of a model configuration issue. Contact your workspace admin.",
  },
  {
    pattern: /audio transcription requires|whisper/i,
    message: "Audio transcription isn't configured for this workspace. Ask your workspace admin to add an OpenAI API key under Settings.",
  },
  {
    pattern: /ragie is not configured|ragie ingestion completed without/i,
    message: "Resubmit — this was processed with an old integration.",
  },
  {
    pattern: /api key|unauthorized|401|invalid.*key|authentication/i,
    message: "A required integration key is invalid or missing. Ask your workspace admin to check provider settings.",
  },
  {
    pattern: /rate limit|429|quota/i,
    message: "An integration hit its usage limit. Try again in a few minutes.",
  },
]

const GENERIC_FALLBACK = "Processing failed. Retry or resubmit."

export function humanizeProcessingError(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) {
    return null
  }

  const match = CATEGORIES.find((category) => category.pattern.test(trimmed))
  return match?.message ?? GENERIC_FALLBACK
}
