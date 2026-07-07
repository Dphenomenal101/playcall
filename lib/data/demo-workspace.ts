import { calls, pendingInvites, playbooks, repAssignments } from "@/lib/playcall-data"
import { buildManagerAnalytics, buildRepAnalytics } from "@/lib/data/live-analytics"
import type { ManagerWorkspaceData, RepWorkspaceData } from "@/lib/data/workspace-types"

export function getDemoRepWorkspaceData(): RepWorkspaceData {
  const currentRep = repAssignments.find((rep) => rep.email === "sarah@playcall.ai") ?? null
  const repCalls = calls.filter((call) => call.rep === "Sarah Chen")
  const leaderboard = repAssignments.filter((rep) => rep.role === "Sales Rep").sort((a, b) => b.avgScore - a.avgScore)
  const analytics = currentRep ? buildRepAnalytics(currentRep, repCalls, leaderboard) : undefined

  return {
    viewer: {
      id: "rep-001",
      email: "sarah@playcall.ai",
      name: "Sarah Chen",
      role: "rep",
    },
    calls: repCalls,
    playbooks: playbooks.filter((playbook) => currentRep?.playbooks.includes(playbook.name)),
    leaderboard,
    currentRep,
    analytics,
  }
}

export function getDemoManagerWorkspaceData(): ManagerWorkspaceData {
  const analytics = buildManagerAnalytics(repAssignments, calls)
  return {
    viewer: {
      id: "rep-005",
      email: "emma@playcall.ai",
      name: "Emma Wilson",
      role: "manager",
    },
    calls,
    playbooks,
    reps: repAssignments,
    invites: pendingInvites,
    analytics,
  }
}
