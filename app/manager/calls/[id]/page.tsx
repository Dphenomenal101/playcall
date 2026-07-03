import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"
import { getLiveCallById } from "@/lib/data/live-workspace"
import { CallDetailPageClient } from "./page.client"

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isDemoMode = (await cookies()).get("playcall_demo_mode")?.value !== "false"
  const call = isDemoMode
    ? getDemoManagerWorkspaceData().calls.find((c) => c.id === id) ?? null
    : await getLiveCallById(id, "manager")

  if (!call && !isDemoMode) {
    notFound()
  }

  return <CallDetailPageClient initialCall={call ?? null} isDemoMode={isDemoMode} />
}
