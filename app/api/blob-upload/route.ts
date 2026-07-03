import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "aac", "flac", "webm", "mpeg", "mpga"])
const AUDIO_CONTENT_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/aac", "audio/flac",
  "audio/x-flac", "audio/webm",
  "video/webm", // some browsers label webm audio tracks as video/webm
]
const MAX_AUDIO_BYTES = 250 * 1024 * 1024

const DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "csv", "txt", "md", "rst", "rtf", "html", "json", "xml", "epub", "odt",
  "mp3", "wav", "m4a", "ogg", "aac", "flac",
  "mp4", "mov", "webm", "avi", "mkv",
  "png", "jpg", "jpeg", "webp", "heic", "tiff",
])
const MAX_DOCUMENT_BYTES = 500 * 1024 * 1024

export async function POST(request: Request): Promise<NextResponse> {
  // Try manager first so the more-permissive document path only applies to managers.
  const viewer =
    (await getLiveViewerContext("manager")) ?? (await getLiveViewerContext("rep"))

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        const ext = (pathname.split(".").pop() ?? "").toLowerCase()

        if (viewer.viewer.role === "rep") {
          if (!AUDIO_EXTENSIONS.has(ext)) {
            throw new Error(`Only audio files are accepted. Supported formats: ${[...AUDIO_EXTENSIONS].join(", ")}`)
          }
          return {
            addRandomSuffix: true,
            allowedContentTypes: AUDIO_CONTENT_TYPES,
            maximumSizeInBytes: MAX_AUDIO_BYTES,
            tokenPayload: JSON.stringify({ workspaceId: viewer.workspaceId }),
          }
        }

        if (!DOCUMENT_EXTENSIONS.has(ext)) {
          throw new Error(`File type .${ext} is not accepted for playbook sources.`)
        }
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_DOCUMENT_BYTES,
          tokenPayload: JSON.stringify({ workspaceId: viewer.workspaceId }),
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
