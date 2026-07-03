import { cookies } from "next/headers"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"
import { getLiveManagerWorkspaceData } from "@/lib/data/live-workspace"
import { ManagerDashboardClient } from "./page.client"

export default async function ManagerDashboardPage() {
  const isDemoMode = (await cookies()).get("playcall_demo_mode")?.value !== "false"
  const data = isDemoMode ? getDemoManagerWorkspaceData() : await getLiveManagerWorkspaceData()
  return <ManagerDashboardClient initialData={data} isDemoMode={isDemoMode} />
}
