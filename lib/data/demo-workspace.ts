import { calls, pendingInvites, playbooks, repAssignments } from "@/lib/playcall-data"
import type { ManagerWorkspaceData, RepWorkspaceData } from "@/lib/data/workspace-types"

export function getDemoRepWorkspaceData(): RepWorkspaceData {
  const currentRep = repAssignments.find((rep) => rep.email === "sarah@playcall.ai") ?? null

  return {
    viewer: {
      id: "rep-001",
      email: "sarah@playcall.ai",
      name: "Sarah Chen",
      role: "rep",
    },
    calls: calls.filter((call) => call.rep === "Sarah Chen"),
    playbooks: playbooks.filter((playbook) => currentRep?.playbooks.includes(playbook.name)),
    leaderboard: repAssignments
      .filter((rep) => rep.role === "Sales Rep")
      .sort((a, b) => b.avgScore - a.avgScore),
    currentRep,
  }
}

export function getDemoManagerWorkspaceData(): ManagerWorkspaceData {
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
  }
}
