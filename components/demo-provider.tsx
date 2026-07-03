"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

interface DemoContextType {
  isDemoMode: boolean
  toggleDemoMode: () => void
}

const DemoContext = createContext<DemoContextType | undefined>(undefined)

function getInitialDemoMode() {
  // Must read localStorage synchronously in the initializer, not a useLayoutEffect —
  // the effect fires after the first render, so pages that call notFound() on missing
  // live data would 404 before the correction ever applied.
  if (typeof window === "undefined") {
    return true
  }

  const saved = localStorage.getItem("playcall_demo_mode")
  return saved !== null ? saved === "true" : true
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(getInitialDemoMode)

  // Cookie keeps server components in sync on next navigation.
  useEffect(() => {
    document.cookie = `playcall_demo_mode=${isDemoMode}; path=/; max-age=31536000; SameSite=Lax`
  }, [isDemoMode])

  const toggleDemoMode = () => {
    setIsDemoMode(prev => {
      const next = !prev
      localStorage.setItem("playcall_demo_mode", String(next))
      document.cookie = `playcall_demo_mode=${next}; path=/; max-age=31536000; SameSite=Lax`
      return next
    })
  }

  return (
    <DemoContext.Provider value={{ isDemoMode, toggleDemoMode }}>
      {children}
    </DemoContext.Provider>
  )
}

export function useDemo() {
  const context = useContext(DemoContext)
  if (context === undefined) {
    throw new Error("useDemo must be used within a DemoProvider")
  }
  return context
}
