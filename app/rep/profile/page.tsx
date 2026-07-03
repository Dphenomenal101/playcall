import { cookies } from "next/headers"
import { getDemoRepWorkspaceData } from "@/lib/data/demo-workspace"
import { getLiveRepWorkspaceData } from "@/lib/data/live-workspace"
import { RepProfileClient } from "./page.client"

export default async function RepProfilePage() {
  const isDemoMode = (await cookies()).get("playcall_demo_mode")?.value !== "false"
  const data = isDemoMode ? getDemoRepWorkspaceData() : await getLiveRepWorkspaceData()
  return <RepProfileClient initialData={data} isDemoMode={isDemoMode} />
}
