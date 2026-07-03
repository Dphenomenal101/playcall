"use client"

import React, { createContext, useCallback, useContext, useMemo, useState } from "react"

export interface Notification {
  id: string
  title: string
  message: string
  type: "success" | "warning" | "error" | "info"
  timestamp: Date
}

interface DashboardContextType {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void
  dismissNotification: (id: string) => void
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  const addNotification = useCallback((notification: Omit<Notification, "id" | "timestamp">) => {
    const id = `notification-${Date.now()}`
    const nextNotification: Notification = {
      ...notification,
      id,
      timestamp: new Date(),
    }

    setNotifications((current) => [nextNotification, ...current].slice(0, 5))

    window.setTimeout(() => {
      setNotifications((current) => current.filter((item) => item.id !== id))
    }, 5000)
  }, [])

  const value = useMemo(
    () => ({
      notifications,
      addNotification,
      dismissNotification,
    }),
    [addNotification, dismissNotification, notifications]
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const context = useContext(DashboardContext)

  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider")
  }

  return context
}
