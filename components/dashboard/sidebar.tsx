"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Activity,
  BookCopy,
  PhoneCall,
  LineChart,
  Trophy,
  Users,
  Settings,
  Search,
  Command,
  X,
} from "lucide-react"
import { useDemo } from "@/components/demo-provider"
import { useDemoLiveResource } from "@/hooks/use-demo-live-resource"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return "?"
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

const navItems = [
  { href: "/manager", label: "Dashboard", icon: Activity, description: "Overview" },
  { href: "/manager/calls", label: "Calls", icon: PhoneCall, description: "Call scoring" },
  { href: "/manager/playbooks", label: "Playbooks", icon: BookCopy, description: "Rubrics" },

  { href: "/manager/team", label: "Team", icon: Users, description: "Reps & members" },
  { href: "/manager/leaderboard", label: "Leaderboard", icon: Trophy, description: "Rankings" },
]

interface SidebarProps {
  onOpenCommand?: () => void
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ onOpenCommand, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { isDemoMode, toggleDemoMode } = useDemo()
  const demoData = getDemoManagerWorkspaceData()
  const { data } = useDemoLiveResource({
    demoData,
    liveUrl: "/api/live/manager",
    emptyData: {
      viewer: null,
      calls: [],
      playbooks: [],
      reps: [],
      invites: [],
    },
  })
  const viewerName = data.viewer?.name?.trim() || "Workspace Admin"
  const viewerInitials = getInitials(viewerName)

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      <aside className={cn(
        "fixed left-0 top-0 h-screen w-64 flex flex-col border-r border-border/40 bg-background/80 backdrop-blur-2xl z-50 transition-transform duration-300",
        "lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between mb-2">
          <Link href="/manager" className="flex items-center gap-3 group" onClick={onClose}>
            <div className="w-8 h-8 rounded-xl bg-lime shadow-[0_0_15px_rgba(163,230,53,0.4)] flex items-center justify-center transition-transform group-hover:scale-105">
              <span className="text-lime-950 font-mono text-sm font-bold">P</span>
            </div>
            <span className="text-lg font-semibold tracking-tight transition-colors group-hover:text-lime">Playcall</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="lg:hidden p-1 hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Search Trigger */}
      <div className="p-4">
        <button
          onClick={onOpenCommand}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground bg-surface/30 border border-border/40 rounded-xl hover:bg-surface/50 hover:border-lime/30 transition-all group"
        >
          <Search className="w-4 h-4 transition-colors group-hover:text-lime" />
          <span className="flex-1 text-left transition-colors group-hover:text-foreground">Search...</span>
          <kbd className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider bg-background/50 px-2 py-0.5 rounded-md border border-border/50 text-muted-foreground">
            <Command className="w-3 h-3" />K
          </kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm transition-all group relative rounded-xl border",
                isActive
                  ? "text-lime bg-lime/10 border-lime/20 shadow-[0_0_15px_rgba(163,230,53,0.05)]"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:bg-surface/30 hover:border-border/30"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4 transition-all",
                  isActive ? "text-lime" : "group-hover:text-foreground"
                )}
              />
              <span className="font-medium">{item.label}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {item.description}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-border/40">
        <Link
          href="/manager/settings"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 mb-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/30 border border-transparent hover:border-border/30 rounded-xl transition-all group"
        >
          <Settings className="w-4 h-4 transition-colors group-hover:text-foreground" />
          <span className="font-medium">Workspace Settings</span>
        </Link>

        {/* Demo Mode Toggle */}
        <div className="flex items-center justify-between px-3 py-2.5 mb-2 bg-surface/50 rounded-xl border border-border/60 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-colors ${isDemoMode ? 'bg-lime shadow-[0_0_8px_rgba(163,230,53,0.8)] pulse-live' : 'bg-muted-foreground/60'}`} />
            <span className="text-xs font-semibold text-foreground/90">Demo Mode</span>
          </div>
          <button 
            onClick={toggleDemoMode}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isDemoMode ? 'bg-lime' : 'bg-border hover:bg-muted-foreground/30'}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${isDemoMode ? 'bg-lime-950 translate-x-4' : 'bg-muted-foreground translate-x-0'}`} />
          </button>
        </div>

        {/* User */}
        <Link
          href="/manager/settings"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2 rounded-xl border border-transparent transition-all hover:bg-surface/30 hover:border-border/30"
        >
          <div className="w-8 h-8 rounded-lg bg-lime/10 border border-lime/20 flex items-center justify-center">
            <span className="text-xs font-bold text-lime">{viewerInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground/90">{viewerName}</p>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">Manager View</p>
          </div>
        </Link>
      </div>
    </aside>
    </>
  )
}
