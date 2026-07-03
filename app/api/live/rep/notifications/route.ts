import { NextResponse } from "next/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"

const FEED_LIMIT = 20

export async function GET() {
  const context = await getLiveViewerContext("rep")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: rows, error } = await context.supabase
    .from("coaching_comments")
    .select("id, body, created_at, read_at, author_id, calls!inner(id, company_name, rep_id)")
    .eq("calls.rep_id", context.viewer.id)
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const authorIds = [...new Set((rows ?? []).map((row) => row.author_id))]
  const { data: authorRows } =
    authorIds.length > 0
      ? await context.supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
      : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> }

  const authorById = new Map((authorRows ?? []).map((row) => [row.id, row]))

  const items = (rows ?? []).map((row) => {
    const call = row.calls as unknown as { id: string; company_name: string | null }
    const author = authorById.get(row.author_id)
    return {
      id: row.id,
      callId: call.id,
      company: call.company_name ?? "Unknown company",
      body: row.body,
      author: author?.full_name ?? author?.email ?? "Manager",
      createdAt: row.created_at,
      isRead: row.read_at !== null,
    }
  })

  return NextResponse.json({
    items,
    unreadCount: items.filter((item) => !item.isRead).length,
  })
}
