"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { clearLiveResourceCache } from "@/hooks/use-demo-live-resource"

interface SignOutButtonProps {
  className?: string
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
}

export function SignOutButton({ className, variant = "outline" }: SignOutButtonProps) {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        throw signOutError
      }

      clearLiveResourceCache()

      // /auth also auto-finalizes any session it finds on mount (for the
      // invite/OTP flow) and redirects straight back into the app - without
      // this marker, a sign-out can look like it "doesn't work" if any
      // session is still resolvable at that instant.
      router.replace("/auth?signedOut=1")
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign out."
      console.error("[sign-out] failed", err)
      setError(message)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={variant}
        onClick={handleSignOut}
        disabled={isSigningOut}
        className={className}
      >
        {isSigningOut ? "Signing out..." : "Sign Out"}
      </Button>
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  )
}
