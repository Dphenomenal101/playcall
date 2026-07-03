import { cookies } from "next/headers"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { getWorkspaceSettings } from "@/lib/data/live-settings"
import { SettingsPageClient, demoSettings } from "./page.client"

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const isDemoMode = cookieStore.get("playcall_demo_mode")?.value !== "false"

  let settings = demoSettings
  if (!isDemoMode) {
    try {
      const context = await getLiveViewerContext("manager")
      if (context) {
        const live = await getWorkspaceSettings(context.workspaceId, context.viewer)
        settings = live as typeof demoSettings
      }
    } catch {
      // fall back to demo settings — error surface on any mutations
    }
  }

  return <SettingsPageClient initialSettings={settings} isDemoMode={isDemoMode} />
}
