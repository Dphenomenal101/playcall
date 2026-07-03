import { cookies } from "next/headers"
import { getDemoRepWorkspaceData } from "@/lib/data/demo-workspace"
import { getLiveRepWorkspaceData } from "@/lib/data/live-workspace"
import { RepDashboardClient } from "./page.client"

export default async function RepDashboardPage() {
  const isDemoMode = (await cookies()).get("playcall_demo_mode")?.value !== "false"
  const data = isDemoMode ? getDemoRepWorkspaceData() : await getLiveRepWorkspaceData()
  return <RepDashboardClient initialData={data} isDemoMode={isDemoMode} />
}
