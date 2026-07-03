"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { motion } from "framer-motion"
import { KeyRound, ArrowLeft } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { getSafeRedirectPath } from "@/lib/auth/redirect"
import { createClient } from "@/lib/supabase/client"
import { hasSupabaseClientEnv } from "@/lib/supabase/env"
import { useToast } from "@/hooks/use-toast"

const OTP_LENGTH = 8

function AuthVerifyPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const email = searchParams.get("email") ?? ""
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const finalizeAccess = async () => {
    const response = await fetch("/api/auth/finalize", {
      method: "POST",
    })

    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to finish sign in.")
    }

    return payload.redirectPath as string
  }

  const handleVerify = async () => {
    setAuthError(null)

    if (!hasSupabaseClientEnv()) {
      setAuthError("Supabase auth is not configured yet.")
      return
    }

    if (!email) {
      setAuthError("Missing email address. Go back and request a new code.")
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      })

      if (error) {
        throw error
      }

      const fallbackRedirectPath = await finalizeAccess()
      const next = getSafeRedirectPath(searchParams.get("next"))
      const redirectPath = next ?? fallbackRedirectPath

      toast({
        title: "Signed in",
        description: "Your workspace access is ready.",
      })

      router.replace(redirectPath)
      router.refresh()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to verify code.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    setAuthError(null)

    if (!hasSupabaseClientEnv()) {
      setAuthError("Supabase auth is not configured yet.")
      return
    }

    if (!email) {
      setAuthError("Missing email address. Go back and request a new code.")
      return
    }

    setIsResending(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({ email })

      if (error) {
        throw error
      }

      toast({
        title: "Code resent",
        description: "A new verification code is on the way.",
      })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to resend code.")
    } finally {
      setIsResending(false)
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
              <KeyRound className="w-6 h-6 text-lime" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Enter verification code</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {email ? `We sent a verification code to ${email}.` : "We sent a verification code to your email."}
            </p>
          </div>

          <div className="flex flex-col items-center space-y-8">
            {authError ? (
              <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                {authError}
              </div>
            ) : null}

            <div className="flex justify-center w-full">
              <InputOTP maxLength={OTP_LENGTH} value={code} onChange={setCode}>
                <InputOTPGroup className="gap-2">
                  {Array.from({ length: OTP_LENGTH }).map((_, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-12 w-9 rounded-xl border border-border/40 bg-surface/30 text-lg transition-all focus:border-lime/50 focus:ring-1 focus:ring-lime/50 md:w-10"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            
            <div className="w-full space-y-3">
              <Button
                type="button"
                onClick={handleVerify}
                disabled={code.length !== OTP_LENGTH || isSubmitting || isResending}
                className="w-full h-12 rounded-xl bg-lime text-lime-950 font-semibold hover:bg-lime/90 shadow-[0_0_15px_rgba(163,230,53,0.2)] transition-all"
              >
                {isSubmitting ? "Verifying..." : "Verify and continue"}
              </Button>
              
              <Button 
                type="button" 
                onClick={handleResend}
                disabled={isSubmitting || isResending}
                variant="outline" 
                className="w-full h-12 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:bg-surface/50"
              >
                {isResending ? "Sending..." : "Resend code"}
              </Button>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border/40 text-center">
            <Link href="/auth" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function AuthVerifyPage() {
  return (
    <Suspense fallback={null}>
      <AuthVerifyPageInner />
    </Suspense>
  )
}
