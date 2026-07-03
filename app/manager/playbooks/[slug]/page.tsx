import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import { getDemoManagerWorkspaceData } from "@/lib/data/demo-workspace"
import { getLiveManagerWorkspaceData } from "@/lib/data/live-workspace"
import { PlaybookDetailPageClient } from "./page.client"

export default async function PlaybookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const isDemoMode = (await cookies()).get("playcall_demo_mode")?.value !== "false"

  if (isDemoMode) {
    const demoData = getDemoManagerWorkspaceData()
    const playbook = demoData.playbooks.find((p) => p.slug === slug) ?? null
    return <PlaybookDetailPageClient initialPlaybook={playbook} initialReps={demoData.reps} isDemoMode={true} />
  }

  const data = await getLiveManagerWorkspaceData()
  const playbook = data.playbooks.find((p) => p.slug === slug) ?? null

  if (!playbook) {
    notFound()
  }

  return <PlaybookDetailPageClient initialPlaybook={playbook} initialReps={data.reps} isDemoMode={false} />
}
