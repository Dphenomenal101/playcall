import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createPlaybookForWorkspace } from "@/lib/data/live-write"
import type { BuilderBlobSource } from "@/lib/data/live-write"

export async function POST(request: Request) {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const blobSources: BuilderBlobSource[] = Array.isArray(body.blobSources)
    ? body.blobSources.filter((item: unknown): item is BuilderBlobSource => {
        if (typeof item !== "object" || item === null) return false
        const src = item as BuilderBlobSource
        if (typeof src.url !== "string" || typeof src.name !== "string") return false
        try {
          const parsed = new URL(src.url)
          return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com")
        } catch {
          return false
        }
      })
    : []

  const playbook = await createPlaybookForWorkspace({
    workspaceId: context.workspaceId,
    userId: context.viewer.id,
    payload: {
      name: typeof body.name === "string" ? body.name : "",
      description: typeof body.description === "string" ? body.description : "",
      segment: typeof body.segment === "string" ? body.segment : "",
      methodology: typeof body.methodology === "string" ? body.methodology : "",
      callTypes: Array.isArray(body.callTypes) ? body.callTypes : [],
      notes: typeof body.notes === "string" ? body.notes : "",
      categories: [],
      uploadedFiles: [],
      blobSources,
    },
    skipInitialRubric: true,
  })

  revalidateTag(`workspace-${context.workspaceId}`, "max")
  return NextResponse.json({
    playbookId: playbook.id,
    slug: playbook.slug,
    processingStatus: playbook.processingStatus,
    hasUploadedFiles: blobSources.length > 0 || (typeof body.notes === "string" && body.notes.trim().length > 0),
  })
}
