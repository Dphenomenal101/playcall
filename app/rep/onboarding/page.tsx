"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Building2, User, ArrowRight, CheckCircle2 } from "lucide-react"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { SessionBadge } from "@/components/auth/session-badge"

export default function RepOnboardingPage() {
  const router = useRouter()
  const [isJoining, setIsJoining] = useState(false)
  const [fullName, setFullName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [workspaceName, setWorkspaceName] = useState("Playcall")
  const [inviterLabel, setInviterLabel] = useState("")
  const [playbookNames, setPlaybookNames] = useState<string[]>([])

  useEffect(() => {
    let isMounted = true

    async function loadUser() {
      const supabase = createClient()
      const [
        {
          data: { user },
        },
        contextResponse,
      ] = await Promise.all([supabase.auth.getUser(), fetch("/api/live/auth/onboarding-context")])

      if (!isMounted) {
        return
      }

      if (user) {
        setEmail(user.email ?? "")

        const metadataName =
          typeof user.user_metadata.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata.name === "string"
              ? user.user_metadata.name
              : ""

        if (metadataName) {
          setFullName(metadataName)
        }
      }

      if (contextResponse.ok) {
        const payload = await contextResponse.json()
        setWorkspaceName(payload.invite?.workspaceName ?? payload.workspaceName ?? "Playcall")
        setInviterLabel(payload.invite?.inviterName ?? payload.invite?.inviterEmail ?? "")
        setPlaybookNames(Array.isArray(payload.invite?.playbookNames) ? payload.invite.playbookNames : [])

        if (!user && payload.email) {
          setEmail(payload.email)
        }

        if (payload.fullName) {
          setFullName((current) => current || payload.fullName)
        }
      }
    }

    void loadUser()

    return () => {
      isMounted = false
    }
  }, [])

  const handleJoinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsJoining(true)

    try {
      const response = await fetch("/api/live/rep/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
        }),
      })

      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error ?? "Unable to join workspace")
      }

      const payload = await response.json().catch(() => null)
      const redirectPath = typeof payload?.redirectPath === "string" ? payload.redirectPath : "/rep"

      router.replace(redirectPath)
      router.refresh()

      setTimeout(() => {
        window.location.assign(redirectPath)
      }, 150)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join workspace")
      setIsJoining(false)
    }
  }

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center overflow-hidden py-12 px-4">
      {/* Abstract Background Elements */}
      <div className="absolute top-1/3 left-0 w-[600px] h-[600px] bg-lime/5 rounded-full blur-[120px] -z-10 mix-blend-screen" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[150px] -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-lg mx-auto"
      >
        <div className="rounded-3xl border border-border/40 bg-card/60 backdrop-blur-2xl p-8 md:p-10 shadow-2xl relative overflow-hidden">
          {/* Decorative Top Highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-lime/50 to-transparent" />
          
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-2xl bg-surface/80 border border-border/40 flex items-center justify-center shadow-inner relative z-10">
                <Building2 className="w-8 h-8 text-foreground" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-lime border-[3px] border-card flex items-center justify-center z-20 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-lime-950" />
              </div>
            </div>
            
            <div className="inline-flex items-center gap-2 mb-3 rounded-full border border-lime/20 bg-lime/5 px-3 py-1">
              <span className="text-xs font-medium text-lime">Invite Accepted</span>
            </div>
            
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Join {workspaceName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {inviterLabel
                ? `${inviterLabel} invited you to join as a sales rep. Confirm your details to open your dashboard.`
                : "Confirm your details to finish joining the workspace and open your rep dashboard."}
            </p>
            <div className="mt-6">
              <SessionBadge email={email} />
            </div>
          </div>

          <form onSubmit={handleJoinWorkspace} className="space-y-6">
            {playbookNames.length > 0 ? (
              <div className="rounded-2xl border border-border/40 bg-background/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned Playbooks</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {playbookNames.map((playbook) => (
                    <span
                      key={playbook}
                      className="rounded-full border border-border/50 bg-surface/40 px-3 py-1 text-xs text-foreground"
                    >
                      {playbook}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Full Name</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <User className="w-4 h-4" />
                  </div>
                  <Input 
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Jane Doe" 
                    className="h-12 pl-10 rounded-xl bg-surface/30 border-border/40 focus:border-lime/50 transition-all text-foreground outline-none" 
                  />
                </div>
              </div>
              
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Work Email</label>
                <Input 
                  disabled
                  value={email}
                  placeholder="you@company.com"
                  className="h-12 rounded-xl bg-surface/10 border-border/20 text-muted-foreground cursor-not-allowed" 
                />
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="pt-4">
              <Button 
                type="submit" 
                disabled={isJoining}
                className="w-full h-12 rounded-xl bg-lime text-lime-950 font-semibold hover:bg-lime/90 shadow-[0_0_15px_rgba(163,230,53,0.2)] transition-all flex items-center justify-center gap-2"
              >
                {isJoining ? "Joining Workspace..." : (
                  <>Enter Dashboard <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </form>

        </div>
      </motion.div>
    </div>
  )
}
