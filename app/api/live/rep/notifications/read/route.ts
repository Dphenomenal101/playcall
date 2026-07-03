import { NextResponse } from "next/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const context = await getLiveViewerContext("rep")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : null

  // Reps can only mark comments on their own calls as read - scope every
  // update through a join back to calls.rep_id rather than trusting the
  // posted ids alone, so a rep can't mark another rep's comments read.
  const admin = createAdminClient()
  const { data: ownCallIds } = await admin.from("calls").select("id").eq("rep_id", context.viewer.id).eq("workspace_id", context.workspaceId)
  const callIdSet = new Set((ownCallIds ?? []).map((row) => row.id))

  if (callIdSet.size === 0) {
    return NextResponse.json({ ok: true, updated: 0 })
  }

  let query = admin
    .from("coaching_comments")
    .update({ read_at: new Date().toISOString() })
    .in("call_id", Array.from(callIdSet))
    .is("read_at", null)

  if (ids && ids.length > 0) {
    query = query.in("id", ids)
  }

  const { data, error } = await query.select("id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
}
