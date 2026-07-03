import { cookies } from "next/headers"
import { getDemoRepWorkspaceData } from "@/lib/data/demo-workspace"
import { getLiveRepWorkspaceData } from "@/lib/data/live-workspace"
import { RepCallsPageClient } from "./page.client"

export default async function RepCallsPage() {
  const isDemoMode = (await cookies()).get("playcall_demo_mode")?.value !== "false"
  const data = isDemoMode ? getDemoRepWorkspaceData() : await getLiveRepWorkspaceData()
  return <RepCallsPageClient initialData={data} isDemoMode={isDemoMode} />
}
