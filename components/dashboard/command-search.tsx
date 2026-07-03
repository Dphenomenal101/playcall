"use client"

import { useEffect, useState, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Activity,
  Trophy,
  Settings,
  Users,
  Upload,
  FileText,
  PhoneCall,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

const managerPages = [
  { name: "Manager Dashboard", href: "/manager", icon: Activity },
  { name: "Scored Calls", href: "/manager/calls", icon: PhoneCall },
  { name: "Playbooks", href: "/manager/playbooks", icon: FileText },

  { name: "Team", href: "/manager/team", icon: Users },
  { name: "Leaderboard", href: "/manager/leaderboard", icon: Trophy },
  { name: "Workspace Settings", href: "/manager/settings", icon: Settings },
]

const repPages = [
  { name: "Rep Home", href: "/rep", icon: Activity },
  { name: "Upload Call", href: "/rep/upload", icon: Upload },
  { name: "My Calls", href: "/rep/calls", icon: PhoneCall },
  { name: "Assigned Playbooks", href: "/rep/playbooks", icon: FileText },
  { name: "Rep Leaderboard", href: "/rep/leaderboard", icon: Trophy },
  { name: "Profile", href: "/rep/profile", icon: Settings },
]

interface CommandSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const inRepView = pathname.startsWith("/rep")
  const primaryPages = inRepView ? repPages : managerPages

  const handleSelect = useCallback(
    (value: string) => {
      onOpenChange(false)
      if (value.startsWith("/")) {
        router.push(value)
      }
    },
    [router, onOpenChange]
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search Playcall pages and shortcuts..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading={inRepView ? "Rep Pages" : "Manager Pages"}>
          {primaryPages.map((page) => (
            <CommandItem
              key={page.href}
              value={page.name}
              onSelect={() => handleSelect(page.href)}
              className="flex items-center gap-3 cursor-pointer"
            >
              <page.icon className="w-4 h-4 text-muted-foreground" />
              <span>{page.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

export function useCommandSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return { open, setOpen }
}
