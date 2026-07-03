import type { CallRecord, PendingInvite, PlaybookRecord, RepAssignment } from "@/lib/playcall-data"

export interface WorkspaceViewer {
  id: string
  email: string | null
  name: string
  role: "manager" | "rep"
}

export type LeaderboardCategory =
  | "overall"
  | "discovery"
  | "objection-handling"
  | "next-step-clarity"
  | "playbook-adherence"
  | "most-improved"

export interface LeaderboardEntry {
  rank: number
  repId: string
  name: string
  score: number
  change: number
}

export interface AnalyticsCategoryInsight {
  label: string
  score: number
  detail: string
  change?: number
  sourceCallId?: string
  sourceCallLabel?: string
}

export interface OutcomeBandInsight {
  band: string
  value: string
  detail: string
}

export interface RepImprovementInsight {
  name: string
  old: number
  new: number
  delta: string
}

export interface CoachingAlertInsight {
  id: string
  name: string
  reason: string
  detail: string
  metric: string
  type: "score" | "percentage"
  sourceCallId?: string
  sourceCallLabel?: string
}

export interface ScoreTrendPoint {
  day: string
  score: number
  delta: number
}

export interface ManagerAnalytics {
  metrics: {
    avgScore: number
    adherenceRate: number
    callsSubmitted: number
    topRep: string
    winRate: number
  }
  changes: {
    avgScore: number
    adherenceRate: number
    callsSubmitted: number
    winRate: number
  }
  sparklines: {
    avgScore: number[]
    adherenceRate: number[]
    callsSubmitted: number[]
    winRate: number[]
  }
  strongestCategories: AnalyticsCategoryInsight[]
  weakestCategories: AnalyticsCategoryInsight[]
  outcomeConversion: OutcomeBandInsight[]
  improvements: RepImprovementInsight[]
  coachingAlerts: CoachingAlertInsight[]
  leaderboard: Record<LeaderboardCategory, LeaderboardEntry[]>
  wonPatterns: AnalyticsCategoryInsight[]
  lostPatterns: AnalyticsCategoryInsight[]
}

export interface RepAnalytics {
  callsSubmitted: number
  closedWonRate: number
  avgScore: number
  strongestSkill: AnalyticsCategoryInsight | null
  weakestSkill: AnalyticsCategoryInsight | null
  playbookAdherenceRate: number
  mostImprovedCategory: AnalyticsCategoryInsight | null
  scoreTrend: ScoreTrendPoint[]
  leaderboardRank: number
  changes: {
    avgScore: number
    callsSubmitted: number
    leaderboardRank: number
    closedWonRate: number
  }
  sparklines: {
    avgScore: number[]
    callsSubmitted: number[]
    leaderboardRank: number[]
    closedWonRate: number[]
  }
}

export interface RepWorkspaceData {
  viewer: WorkspaceViewer | null
  calls: CallRecord[]
  playbooks: PlaybookRecord[]
  leaderboard: RepAssignment[]
  currentRep: RepAssignment | null
  analytics?: RepAnalytics
}

export interface ManagerWorkspaceData {
  viewer: WorkspaceViewer | null
  calls: CallRecord[]
  playbooks: PlaybookRecord[]
  reps: RepAssignment[]
  invites: PendingInvite[]
  analytics?: ManagerAnalytics
  /** Provider roles (primary_llm, enrichment, ragie) with no usable workspace key and no env fallback. Empty once fully configured. */
  missingProviderRoles?: string[]
}
