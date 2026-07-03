"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell, MessageSquareText } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDemo } from "@/components/demo-provider"
import { cn } from "@/lib/utils"

interface NotificationItem {
  id: string
  callId: string
  company: string
  body: string
  author: string
  createdAt: string
  isRead: boolean
}

const DEMO_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "demo-1",
    callId: "call-001",
    company: "Vanta",
    body: "Strong recovery on the budget question - keep anchoring it to their Series A timeline like this.",
    author: "Emma Wilson",
    createdAt: new Date().toISOString(),
    isRead: false,
  },
  {
    id: "demo-2",
    callId: "call-002",
    company: "Linear",
    body: "Make sure to confirm who signs off on spend before the next call with this account.",
    author: "Emma Wilson",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    isRead: true,
  },
]

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function NotificationBell() {
  const { isDemoMode } = useDemo()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/live/rep/notifications")
      if (!response.ok) return
      const payload = await response.json()
      setItems(payload.items ?? [])
      setUnreadCount(payload.unreadCount ?? 0)
    } catch {
      // Best-effort - a failed poll shouldn't surface as an error toast.
    }
  }

  useEffect(() => {
    if (isDemoMode) {
      setItems(DEMO_NOTIFICATIONS)
      setUnreadCount(DEMO_NOTIFICATIONS.filter((item) => !item.isRead).length)
      return
    }

    void fetchNotifications()
    const interval = window.setInterval(fetchNotifications, 30000)
    return () => window.clearInterval(interval)
  }, [isDemoMode])

  const markAllRead = async () => {
    if (isDemoMode) {
      setItems((current) => current.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
      return
    }

    if (unreadCount === 0) return

    setItems((current) => current.map((item) => ({ ...item, isRead: true })))
    setUnreadCount(0)

    try {
      await fetch("/api/live/rep/notifications/read", { method: "POST" })
    } catch {
      void fetchNotifications()
    }
  }

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) {
          void markAllRead()
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `${unreadCount} unread manager comments` : "Manager comments"}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full border bg-card/40 backdrop-blur-xl transition-all hover:bg-card/80 shadow-sm",
            unreadCount > 0
              ? "border-lime/30 text-foreground"
              : "border-border/40 text-muted-foreground hover:text-foreground"
          )}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-lime px-1 text-[9px] font-bold text-lime-950 shadow-[0_0_10px_rgba(163,230,53,0.4)] ring-[1.5px] ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl border-border/40 bg-card/95 p-0 backdrop-blur-xl">
        <div className="border-b border-border/40 px-4 py-3">
          <p className="text-sm font-semibold text-foreground/90">Manager feedback</p>
        </div>
        <div className="max-h-[22rem] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {items.length > 0 ? (
            items.map((item) => (
              <DropdownMenuItem key={item.id} asChild className="p-0 focus:bg-transparent">
                <Link
                  href={`/rep/calls/${item.callId}`}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-xl p-3 transition-colors outline-none",
                    !item.isRead ? "bg-lime/5 hover:bg-lime/10" : "hover:bg-surface/60"
                  )}
                >
                  {!item.isRead && (
                    <div className="absolute left-1.5 top-4 w-1.5 h-1.5 rounded-full bg-lime shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                  )}
                  
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm mt-0.5 transition-colors",
                    !item.isRead ? "bg-lime/10 border-lime/20 text-lime" : "bg-surface border-border/50 text-muted-foreground group-hover:text-foreground/80"
                  )}>
                    <MessageSquareText className="h-4 w-4" />
                  </div>
                  
                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground/90 truncate">{item.company}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatRelativeTime(item.createdAt)}</span>
                    </div>
                    
                    <p className={cn(
                      "text-xs leading-relaxed line-clamp-2",
                      !item.isRead ? "text-foreground/80 font-medium" : "text-muted-foreground"
                    )}>
                      {item.body}
                    </p>
                    
                    <span className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                      From {item.author}
                    </span>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">No manager feedback yet.</p>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
