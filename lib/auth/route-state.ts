import type { AppRole } from "@/lib/data/auth"

export function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/auth" ||
    pathname === "/auth/verify" ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  )
}

export function getRoleHome(role: AppRole) {
  return role === "manager" ? "/manager" : "/rep"
}

export function getOnboardingPath(role: AppRole | "unassigned") {
  if (role === "rep") {
    return "/rep/onboarding"
  }

  return "/manager/onboarding"
}

export function canAccessRolePath(pathname: string, role: AppRole) {
  if (pathname.startsWith("/manager")) {
    return role === "manager"
  }

  if (pathname.startsWith("/rep")) {
    return role === "rep"
  }

  return true
}
