import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { finalizeUserAccess, getPostAuthRedirectPath } from "@/lib/data/auth"

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: error?.message ?? "Unauthorized" }, { status: 401 })
  }

  await finalizeUserAccess(supabase, user)
  const redirectPath = await getPostAuthRedirectPath(supabase, user.id, user.email)

  return NextResponse.json({ redirectPath })
}
