import { cookies } from "next/headers"
import { calls } from "@/lib/playcall-data"
import { getLiveCallById } from "@/lib/data/live-workspace"
import { RepCallDetailClient } from "./page.client"

export default async function RepCallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isDemoMode = (await cookies()).get("playcall_demo_mode")?.value !== "false"
  const call = isDemoMode
    ? (calls.find((c) => c.id === id) ?? null)
    : await getLiveCallById(id, "rep")
  return <RepCallDetailClient initialCall={call} isDemoMode={isDemoMode} />
}
