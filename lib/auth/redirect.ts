export function getSafeRedirectPath(next: string | null | undefined) {
  if (!next) {
    return null
  }

  if (!next.startsWith("/") || next.startsWith("//")) {
    return null
  }

  return next
}
