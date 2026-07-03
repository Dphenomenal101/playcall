"use client"

import React, { useState } from "react"

import { RepSidebar } from "./rep-sidebar"
import { CommandSearch, useCommandSearch } from "./command-search"
import { NotificationToast } from "./notification-toast"
import { NotificationBell } from "./notification-bell"
import { DashboardProvider } from "@/context/dashboard-context"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, Search } from "lucide-react"
import Link from "next/link"

interface RepDashboardLayoutProps {
  children: React.ReactNode
}

export function RepDashboardLayout({ children }: RepDashboardLayoutProps) {
  const { open, setOpen } = useCommandSearch()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <DashboardProvider>
      <div className="min-h-screen bg-background noise-overlay">
        {/* Mobile Header */}
        <header className="fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-2xl border-b border-border/40 z-30 lg:hidden">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              <Link href="/rep" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-xl bg-lime shadow-[0_0_15px_rgba(163,230,53,0.4)] flex items-center justify-center transition-transform group-hover:scale-105">
                  <span className="text-lime-950 font-mono text-sm font-bold">P</span>
                </div>
                <span className="font-semibold text-lg tracking-tight">Playcall</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button
                onClick={() => setOpen(true)}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Desktop notification bell - top right, above the page content since there's no persistent desktop header */}
        <div className="fixed top-6 right-8 z-30 hidden lg:block">
          <NotificationBell />
        </div>

        <RepSidebar
          onOpenCommand={() => setOpen(true)}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <CommandSearch open={open} onOpenChange={setOpen} />

      <main className="lg:pl-64 pt-14 lg:pt-0">
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      
      <NotificationToast />
    </div>
    </DashboardProvider>
  )
}
