import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSafeRedirectPath } from "@/lib/auth/redirect"
import { finalizeUserAccess, getPostAuthRedirectPath } from "@/lib/data/auth"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = url.searchParams.get("next")
  const origin = url.origin
  const safeNext = getSafeRedirectPath(next)

  if (!code) {
    const redirectUrl = new URL("/auth", origin)
    redirectUrl.searchParams.set("error", "invalid_auth_callback")
    if (safeNext) {
      redirectUrl.searchParams.set("next", safeNext)
    }
    return NextResponse.redirect(redirectUrl)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const redirectUrl = new URL("/auth", origin)
    redirectUrl.searchParams.set("error", error.message)
    if (safeNext) {
      redirectUrl.searchParams.set("next", safeNext)
    }
    return NextResponse.redirect(redirectUrl)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const redirectUrl = new URL("/auth", origin)
    redirectUrl.searchParams.set("error", "missing_user")
    if (safeNext) {
      redirectUrl.searchParams.set("next", safeNext)
    }
    return NextResponse.redirect(redirectUrl)
  }

  await finalizeUserAccess(supabase, user)
  const redirectPath = safeNext ?? (await getPostAuthRedirectPath(supabase, user.id, user.email))

  return NextResponse.redirect(new URL(redirectPath, origin))
}
