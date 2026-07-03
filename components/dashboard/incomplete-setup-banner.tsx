"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const ROLE_LABELS: Record<string, string> = {
  primary_llm: "a primary LLM provider",
  fallback_llm: "a fallback LLM provider",
  enrichment: "an enrichment provider",
  document_parsing: "a LlamaParse API key",
}

function describeMissingRoles(roles: string[]) {
  const labels = roles.map((role) => ROLE_LABELS[role] ?? role)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`
}

interface IncompleteSetupBannerProps {
  missingProviderRoles: string[]
}

// Onboarding lets a manager skip provider setup and land in the dashboard
// anyway (the proxy gate only checks workspace membership, not whether
// setup actually finished) - so a workspace can look fully functional while
// playbook creation/call scoring will hard-fail the moment they're tried.
// Dismissal is per-tab-session only (not persisted) so it doesn't nag every
// click but still resurfaces on the next real visit until setup is done.
export function IncompleteSetupBanner({ missingProviderRoles }: IncompleteSetupBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed || missingProviderRoles.length === 0) {
    return null
  }

  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/10 p-3 sm:px-4 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500" />
      
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-500/20">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-500">Workspace setup incomplete</h3>
        <p className="mt-0.5 text-xs text-yellow-700 dark:text-yellow-200/70">
          Add {describeMissingRoles(missingProviderRoles)} before creating playbooks or scoring calls.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 mt-3 sm:mt-0">
        <Link href="/manager/settings">
          <Button variant="outline" size="sm" className="h-7 rounded-lg border-yellow-300 dark:border-yellow-500/30 bg-transparent text-xs font-medium text-yellow-800 dark:text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 hover:text-yellow-900 transition-colors">
            Configure
          </Button>
        </Link>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          aria-label="Dismiss"
          className="p-1 rounded-md text-yellow-600/50 dark:text-yellow-500/50 transition-colors hover:bg-yellow-200 dark:hover:bg-yellow-500/10 hover:text-yellow-800 dark:hover:text-yellow-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
