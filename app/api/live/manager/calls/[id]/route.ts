import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { getLiveCallById } from "@/lib/data/live-workspace"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const call = await getLiveCallById(id, "manager")

  if (!call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(call)
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await getLiveViewerContext("manager")

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const comment = typeof body?.comment === "string" ? body.comment.trim() : ""

  if (!comment) {
    return NextResponse.json({ error: "Comment is required" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Without this, call_id (from the URL) was trusted blindly - a manager
  // could comment on any call in any workspace by guessing/enumerating call
  // ids, and since the comments-fetch query filters by call_id membership
  // only (not workspace_id on the comment row), it would actually show up
  // on the other tenant's call page.
  const { data: call } = await admin
    .from("calls")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", viewer.workspaceId)
    .maybeSingle()

  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 })
  }

  const { data, error } = await admin
    .from("coaching_comments")
    .insert({
      call_id: id,
      workspace_id: viewer.workspaceId,
      author_id: viewer.viewer.id,
      body: comment,
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  revalidateTag(`workspace-${viewer.workspaceId}`, "max")
  revalidateTag(`call-${id}`, "max")
  return NextResponse.json({ ok: true, id: data.id })
}
