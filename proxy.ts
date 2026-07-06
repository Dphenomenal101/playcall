import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getCurrentMembership, getPendingInviteAccess, getProfile } from "@/lib/data/auth"
import { canAccessRolePath, getRoleHome, isPublicPath } from "@/lib/auth/route-state"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env"

export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.next()
  }

  const pathname = request.nextUrl.pathname
  const isApiRoute = pathname.startsWith("/api/")
  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (isPublicPath(pathname)) {
      return response
    }

    const redirectUrl = new URL("/auth", request.url)
    redirectUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  const membership = await getCurrentMembership(supabase as any, user.id)
  const pendingInvite = !membership ? await getPendingInviteAccess(supabase as any, user.email) : null
  const profile = await getProfile(supabase as any, user.id)
  const authMetadataName =
    (typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata.name === "string" && user.user_metadata.name.trim()) ||
    ""
  const hasFullName = Boolean(profile?.full_name?.trim() || authMetadataName)

  console.log("[proxy] auth gate", {
    pathname,
    userId: user.id,
    membershipRole: membership?.role ?? null,
    membershipWorkspaceId: membership?.workspaceId ?? null,
    pendingInviteRole: pendingInvite?.role ?? null,
    hasFullName,
  })

  if (!membership) {
    if (pendingInvite?.role === "rep") {
      console.log("[proxy] pending rep invite branch", { pathname })
      if (pathname === "/" || pathname === "/auth") {
        return NextResponse.redirect(new URL("/rep/onboarding", request.url))
      }

      if (pathname.startsWith("/rep/onboarding") || isApiRoute) {
        return response
      }
    }

    if (pathname === "/" || pathname === "/auth") {
      return NextResponse.redirect(new URL("/manager/onboarding", request.url))
    }

    if (pathname.startsWith("/manager/onboarding")) {
      return response
    }

    if (pathname.startsWith("/rep/onboarding")) {
      return NextResponse.redirect(new URL("/manager/onboarding", request.url))
    }

    if (!isPublicPath(pathname)) {
      return NextResponse.redirect(new URL("/manager/onboarding", request.url))
    }

    return response
  }

  if (pathname === "/" || pathname === "/auth") {
    console.log("[proxy] role home redirect", {
      pathname,
      role: membership.role,
      hasFullName,
      redirectTo: membership.role === "rep" && !hasFullName ? "/rep/onboarding" : getRoleHome(membership.role),
    })
    if (membership.role === "rep" && !hasFullName) {
      return NextResponse.redirect(new URL("/rep/onboarding", request.url))
    }

    return NextResponse.redirect(new URL(getRoleHome(membership.role), request.url))
  }

  if (!canAccessRolePath(pathname, membership.role)) {
    console.log("[proxy] blocked role path", {
      pathname,
      role: membership.role,
      redirectTo: getRoleHome(membership.role),
    })
    return NextResponse.redirect(new URL(getRoleHome(membership.role), request.url))
  }

  if (membership.role === "manager") {
    if (pathname.startsWith("/manager/onboarding")) {
      return NextResponse.redirect(new URL("/manager", request.url))
    }

    if (pathname.startsWith("/rep/onboarding")) {
      return NextResponse.redirect(new URL("/manager", request.url))
    }

    return response
  }

  if (!hasFullName && !pathname.startsWith("/rep/onboarding") && !isApiRoute) {
    console.log("[proxy] rep missing name redirect", { pathname })
    return NextResponse.redirect(new URL("/rep/onboarding", request.url))
  }

  if (hasFullName && pathname.startsWith("/rep/onboarding")) {
    console.log("[proxy] rep onboarding complete redirect", { pathname })
    return NextResponse.redirect(new URL("/rep", request.url))
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
