import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Pinged daily by Vercel Cron (see vercel.json) purely to generate real
// database activity - Supabase's free tier auto-pauses a project after 7
// days with no activity at all. The clock for this needs to live outside
// Supabase itself (per Supabase's own guidance): if the project ever did
// pause, nothing running inside it (e.g. pg_cron) could revive it, since the
// whole instance is suspended. Vercel Cron runs independent of that.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from("workspaces").select("id").limit(1)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() })
}
