"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KeyRound, Sparkles } from "lucide-react"
import { motion } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import { getSafeRedirectPath } from "@/lib/auth/redirect"
import { createClient } from "@/lib/supabase/client"
import { hasSupabaseClientEnv } from "@/lib/supabase/env"
import { useToast } from "@/hooks/use-toast"
import { SessionBadge } from "@/components/auth/session-badge"

function AuthPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const prefilledEmail = searchParams.get("email") ?? ""
  const initialError = searchParams.get("error")
  const [email, setEmail] = useState(prefilledEmail)
  const [otpPending, setOtpPending] = useState(false)
  const [isFinishingInvite, setIsFinishingInvite] = useState(false)
  const [authError, setAuthError] = useState<string | null>(() => {
    if (initialError === "invalid_auth_callback") {
      return "This link uses an unsupported callback flow. Start from the sign-in screen or use the latest invite link."
    }

    return initialError
  })
  const hasSupabase = useMemo(() => hasSupabaseClientEnv(), [])
  const hasFinalizedSessionRef = useRef(false)

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail)
    }
  }, [prefilledEmail])

  useEffect(() => {
    if (initialError === "invalid_auth_callback") {
      setAuthError("This link uses an unsupported callback flow. Start from the sign-in screen or use the latest invite link.")
      return
    }

    setAuthError(initialError)
  }, [initialError])

  const justSignedOut = searchParams.get("signedOut") === "1"

  useEffect(() => {
    if (!hasSupabase || justSignedOut) {
      return
    }

    const supabase = createClient()

    async function finalizeInviteSession() {
      if (hasFinalizedSessionRef.current) {
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        return
      }

      hasFinalizedSessionRef.current = true
      setIsFinishingInvite(true)
      setAuthError(null)

      try {
        const response = await fetch("/api/auth/finalize", {
          method: "POST",
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to finish sign in.")
        }

        const next = getSafeRedirectPath(searchParams.get("next"))
        const redirectPath = next ?? payload.redirectPath

        router.replace(redirectPath)
        router.refresh()
      } catch (error) {
        hasFinalizedSessionRef.current = false
        setIsFinishingInvite(false)
        setAuthError(error instanceof Error ? error.message : "Unable to finish sign in.")
      }
    }

    void finalizeInviteSession()

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        void finalizeInviteSession()
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [hasSupabase, justSignedOut, router, searchParams])

  const handleOTP = async () => {
    setAuthError(null)

    if (!hasSupabase) {
      setAuthError("Supabase auth is not configured yet.")
      return
    }

    setOtpPending(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
      })

      if (error) {
        throw error
      }

      const params = new URLSearchParams({ email })
      const next = getSafeRedirectPath(searchParams.get("next"))
      if (next) {
        params.set("next", next)
      }

      toast({
        title: "Code sent",
        description: "Enter the verification code from your inbox.",
      })

      router.push(`/auth/verify?${params.toString()}`)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to send verification code.")
    } finally {
      setOtpPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-lime/10 rounded-full blur-[120px] -z-10 mix-blend-screen animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[150px] -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md mx-auto p-6 md:p-8"
      >
        <div className="rounded-3xl border border-border/40 bg-card/60 backdrop-blur-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Decorative Top Highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-lime/50 to-transparent" />
          
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-surface/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
              <Sparkles className="w-6 h-6 text-lime" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome to Playcall</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with a one-time code to create a workspace or join your team.
            </p>
            <div className="mt-6">
              <SessionBadge email={email} label="Current session" />
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleOTP()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Work email</label>
              <Input 
                type="email"
                placeholder="you@company.com" 
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 rounded-xl bg-surface/30 border-border/40 focus:border-lime/50 transition-all text-foreground/80 outline-none px-4" 
              />
            </div>

            {authError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                {authError}
              </div>
            ) : null}

            {isFinishingInvite ? (
              <div className="rounded-2xl border border-lime/20 bg-lime/5 px-4 py-3 text-sm text-lime-100">
                Accepting your invite and preparing workspace access...
              </div>
            ) : null}
            
            <div className="pt-2 space-y-3">
              <Button
                type="submit"
                disabled={!email || otpPending || isFinishingInvite}
                className="w-full h-12 rounded-xl bg-lime text-lime-950 font-semibold hover:bg-lime/90 shadow-[0_0_15px_rgba(163,230,53,0.2)] transition-all flex items-center justify-center gap-2"
              >
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                {otpPending ? "Sending code..." : "Send one-time code"}
              </Button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-border/40 text-center">
            <p className="text-sm text-foreground mb-2 font-medium">Setting up Playcall for your team?</p>
            <p className="text-xs text-muted-foreground">
              Enter your work email and we will route you into workspace creation or rep onboarding automatically.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageInner />
    </Suspense>
  )
}
