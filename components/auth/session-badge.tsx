import { User } from "lucide-react"

interface SessionBadgeProps {
  email: string | null | undefined
  label?: string
}

export function SessionBadge({ email, label = "Signed in as" }: SessionBadgeProps) {
  const normalizedEmail = email?.trim()

  if (!normalizedEmail) {
    return null
  }

  const initial = normalizedEmail.charAt(0).toUpperCase()

  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-border/40 bg-surface/40 pr-4 pl-1.5 py-1.5 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-surface/60">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime/20 border border-lime/30 shadow-[0_0_10px_rgba(163,230,53,0.1)]">
        <span className="font-mono text-[11px] font-bold text-lime-600 dark:text-lime-400">
          {initial}
        </span>
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground leading-tight mb-0.5">{label}</span>
        <span className="font-mono text-[11px] font-medium text-foreground leading-tight">{normalizedEmail}</span>
      </div>
    </div>
  )
}
