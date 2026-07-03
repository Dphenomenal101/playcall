import type { CallRecord, RepAssignment, ScoreDimension } from "@/lib/playcall-data"
import type {
  AnalyticsCategoryInsight,
  CoachingAlertInsight,
  LeaderboardCategory,
  LeaderboardEntry,
  ManagerAnalytics,
  OutcomeBandInsight,
  RepAnalytics,
  RepImprovementInsight,
  ScoreTrendPoint,
} from "@/lib/data/workspace-types"

// Category scores are 0-100 percentages; below this, a category is a real
// coaching gap rather than just the relatively-lowest of several strong ones.
const COACHING_THRESHOLD = 80

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100
  }

  return Math.round((((current - previous) / Math.abs(previous)) * 100) * 10) / 10
}

function toPercent(score: number, outOf: number) {
  if (!Number.isFinite(score) || !Number.isFinite(outOf) || outOf <= 0) {
    return 0
  }

  return Math.round((score / outOf) * 100)
}

function normalizeCategoryKey(label: string): LeaderboardCategory | null {
  const value = label.toLowerCase()

  if (value.includes("discover")) return "discovery"
  if (value.includes("objection")) return "objection-handling"
  if (value.includes("next")) return "next-step-clarity"
  if (value.includes("adherence") || value.includes("playbook")) return "playbook-adherence"

  return null
}

export function isPositiveOutcome(outcome: string) {
  const value = outcome.toLowerCase()
  return value.includes("won") || value.includes("booked") || value.includes("moved")
}

export function isWinOutcome(outcome: string) {
  const value = outcome.toLowerCase()
  return value.includes("won")
}

function getScoredCalls(calls: CallRecord[]) {
  return calls.filter((call) => Number.isFinite(call.score) && call.score > 0)
}

function formatCallLabel(call: CallRecord) {
  return `${call.company} · ${call.date}`
}

function splitRecentAndPrevious<T>(items: T[]) {
  const midpoint = Math.max(1, Math.ceil(items.length / 2))
  return {
    recent: items.slice(0, midpoint),
    previous: items.slice(midpoint),
  }
}

function toSparkline(values: number[], fallback = 0) {
  if (values.length === 0) {
    return [fallback]
  }

  return values.slice(-12)
}

function buildCategoryInsights(calls: CallRecord[]) {
  const categoryMap = new Map<string, { scores: number[]; entries: Array<{ dimension: ScoreDimension; call: CallRecord }> }>()

  for (const call of getScoredCalls(calls)) {
    for (const dimension of call.scoreBreakdown) {
      const current = categoryMap.get(dimension.label) ?? { scores: [], entries: [] }
      current.scores.push(toPercent(dimension.score, dimension.outOf))
      current.entries.push({ dimension, call })
      categoryMap.set(dimension.label, current)
    }
  }

  const insights: AnalyticsCategoryInsight[] = Array.from(categoryMap.entries()).map(([label, value]) => {
    const representative = value.entries.find((entry) => entry.dimension.note.trim().length > 0)
    return {
      label,
      score: average(value.scores),
      detail:
        representative?.dimension.note.trim() ||
        `Average across ${value.scores.length} scored dimension${value.scores.length === 1 ? "" : "s"}.`,
      sourceCallId: representative?.call.id,
      sourceCallLabel: representative ? formatCallLabel(representative.call) : undefined,
    }
  })

  return {
    strongest: [...insights].sort((a, b) => b.score - a.score).slice(0, 3),
    // Below COACHING_THRESHOLD only - a category scoring 85-90 isn't a
    // coaching gap, it's just the relative bottom of an otherwise strong team.
    weakest: insights.filter((insight) => insight.score < COACHING_THRESHOLD).sort((a, b) => a.score - b.score).slice(0, 3),
  }
}

function averageCategoryScore(calls: CallRecord[], category: LeaderboardCategory) {
  if (category === "overall") {
    return average(getScoredCalls(calls).map((call) => call.score))
  }

  if (category === "most-improved") {
    return 0
  }

  const values = getScoredCalls(calls)
    .flatMap((call) => call.scoreBreakdown)
    .filter((dimension) => normalizeCategoryKey(dimension.label) === category)
    .map((dimension) => toPercent(dimension.score, dimension.outOf))

  return average(values)
}

function computeRepDelta(calls: CallRecord[]) {
  const scoredCalls = getScoredCalls(calls)
  const { recent, previous } = splitRecentAndPrevious(scoredCalls)
  const recentAverage = average(recent.map((call) => call.score))
  const previousAverage = previous.length > 0 ? average(previous.map((call) => call.score)) : recentAverage

  return {
    recentAverage,
    previousAverage,
    delta: recentAverage - previousAverage,
  }
}

function buildLeaderboardEntries(
  reps: RepAssignment[],
  callsByRepId: Map<string, CallRecord[]>,
  category: LeaderboardCategory
) {
  const ranked = reps
    .filter((rep) => rep.role === "Sales Rep")
    .map((rep) => {
      const relatedCalls = callsByRepId.get(rep.id) ?? []
      const deltaStats = computeRepDelta(relatedCalls)
      const score =
        category === "most-improved"
          ? Math.max(deltaStats.delta, 0)
          : averageCategoryScore(relatedCalls, category) || (category === "overall" ? rep.avgScore : 0)

      // "Overall" stands in for general performance, so a rep who actually
      // closes deals should outrank one who just scores well internally but
      // wins nothing - rank by a win-rate-weighted composite there, while
      // still displaying the plain average score. Per-skill categories
      // (discovery, objection-handling, etc.) stay pure skill averages,
      // since win rate isn't a meaningful signal for one dimension.
      const winRate =
        relatedCalls.length > 0 ? relatedCalls.filter((call) => isWinOutcome(call.outcome)).length / relatedCalls.length : 0
      const rankScore = category === "overall" ? winRate * 60 + score * 0.4 : score

      const entry: LeaderboardEntry = {
        repId: rep.id,
        name: rep.name,
        score,
        change: deltaStats.delta,
        rank: 0,
      }

      return { entry, rankScore }
    })
    .sort((a, b) => b.rankScore - a.rankScore || b.entry.change - a.entry.change || a.entry.name.localeCompare(b.entry.name))

  return ranked.map(({ entry }, index) => ({ ...entry, rank: index + 1 }))
}

function buildCallsByRepId(reps: RepAssignment[], calls: CallRecord[]) {
  const repIdByName = new Map(reps.map((rep) => [rep.name, rep.id]))
  const result = new Map<string, CallRecord[]>()

  for (const call of calls) {
    const repId = repIdByName.get(call.rep)
    if (!repId) {
      continue
    }

    const current = result.get(repId) ?? []
    current.push(call)
    result.set(repId, current)
  }

  return result
}

function buildOutcomeConversion(calls: CallRecord[]): OutcomeBandInsight[] {
  const scoredCalls = getScoredCalls(calls)
  const bands = [
    { label: "90-100", min: 90, max: 100 },
    { label: "80-89", min: 80, max: 89 },
    { label: "70-79", min: 70, max: 79 },
    { label: "<70", min: 0, max: 69 },
  ]

  return bands.map((band) => {
    const inBand = scoredCalls.filter((call) => call.score >= band.min && call.score <= band.max)
    const positiveCount = inBand.filter((call) => isPositiveOutcome(call.outcome)).length
    const rate = inBand.length > 0 ? Math.round((positiveCount / inBand.length) * 100) : 0

    return {
      band: band.label,
      value: `${rate}%`,
      detail:
        inBand.length > 0
          ? `${positiveCount} of ${inBand.length} calls drove a positive outcome.`
          : "No scored calls in this range yet.",
    }
  })
}

function normalizePatternText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
}

function buildPatternInsights(calls: CallRecord[], type: "won" | "lost"): AnalyticsCategoryInsight[] {
  const relevantCalls = calls.filter((call) =>
    type === "won" ? isPositiveOutcome(call.outcome) : call.outcome.toLowerCase().includes("lost")
  )

  if (type === "won") {
    const counts = new Map<string, number>()

    for (const call of relevantCalls) {
      const candidates = [
        call.bestMoment,
        ...call.transcriptEvidence.map((item) => item.title),
        ...call.scoreBreakdown.filter((dimension) => toPercent(dimension.score, dimension.outOf) >= 80).map((dimension) => dimension.label),
      ]

      for (const rawValue of candidates) {
        if (typeof rawValue !== "string") {
          continue
        }

        const normalized = normalizePatternText(rawValue)
        if (!normalized || normalized.length < 8) {
          continue
        }

        // Skip the placeholder written when best_moment is null in the DB
        if (normalized.toLowerCase().startsWith("no best moment")) {
          continue
        }

        counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([label, count]) => ({
        label,
        score: count,
        detail: `Observed in ${count} positively progressing call${count === 1 ? "" : "s"}.`,
      }))
  }

  // Lost calls: keep the exact missed quote (it's the actionable part - "exactly
  // what went wrong") but label each card by its source category instead of the
  // quote itself, so the card reads as a category with supporting evidence rather
  // than a wall of undifferentiated sentences.
  const groups = new Map<string, { category: string; count: number }>()

  for (const call of relevantCalls) {
    const candidates: Array<{ category: string; quote: string }> = [
      { category: "Deal Loss Reason", quote: call.lossReason ?? "" },
      { category: "Critical Missed Moment", quote: call.topMissedMoment },
      ...call.missedQuestions.map((quote) => ({ category: "Missed Discovery Question", quote })),
      ...call.missedOpportunities.map((quote) => ({ category: "Missed Opportunity", quote })),
      ...call.productInaccuracies.map((quote) => ({ category: "Product Inaccuracy", quote })),
    ]

    for (const { category, quote } of candidates) {
      const normalized = normalizePatternText(quote)
      if (!normalized || normalized.length < 8) {
        continue
      }

      const current = groups.get(normalized) ?? { category, count: 0 }
      current.count += 1
      groups.set(normalized, current)
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([quote, { category, count }]) => ({
      label: category,
      score: count,
      detail: `"${quote}" - observed in ${count} closed-lost call${count === 1 ? "" : "s"}.`,
    }))
}

function buildImprovements(reps: RepAssignment[], callsByRepId: Map<string, CallRecord[]>): RepImprovementInsight[] {
  return reps
    .filter((rep) => rep.role === "Sales Rep")
    .map((rep) => {
      const deltaStats = computeRepDelta(callsByRepId.get(rep.id) ?? [])
      return {
        name: rep.name,
        old: deltaStats.previousAverage,
        new: deltaStats.recentAverage,
        delta: `${deltaStats.delta >= 0 ? "+" : ""}${deltaStats.delta} pts`,
        deltaValue: deltaStats.delta,
      }
    })
    .filter((entry) => entry.new > 0)
    .sort((a, b) => b.deltaValue - a.deltaValue)
    .slice(0, 3)
    .map(({ deltaValue: _deltaValue, ...entry }) => entry)
}

function findLowestScoringCall(calls: CallRecord[]) {
  return calls.reduce<CallRecord | null>((lowest, call) => (!lowest || call.score < lowest.score ? call : lowest), null)
}

function findLowestAdherenceCall(calls: CallRecord[]) {
  return calls.reduce<CallRecord | null>((lowest, call) => (!lowest || call.adherence < lowest.adherence ? call : lowest), null)
}

function buildCoachingAlerts(reps: RepAssignment[], callsByRepId: Map<string, CallRecord[]>): CoachingAlertInsight[] {
  return reps
    .filter((rep) => rep.role === "Sales Rep")
    .map((rep): CoachingAlertInsight | null => {
      // getScoredCalls preserves the caller's ordering (newest-first, same
      // convention splitRecentAndPrevious relies on), so calls[0] is the
      // most recent scored call for this rep.
      const calls = getScoredCalls(callsByRepId.get(rep.id) ?? [])
      const adherence = average(calls.map((call) => call.adherence))
      const deltaStats = computeRepDelta(calls)
      // Derived from the calls actually passed in (the filtered slice), not
      // the rep record's all-time avgScore, so this reacts to the dashboard
      // filter bar the same way the adherence and regression checks do.
      const avgScore = average(calls.map((call) => call.score))

      if (calls.length > 0 && avgScore <= 70) {
        const sourceCall = findLowestScoringCall(calls)
        return {
          id: rep.id,
          name: rep.name,
          reason: "Low average score",
          detail: "Recent scored calls are below the coaching threshold.",
          metric: String(avgScore),
          type: "score" as const,
          sourceCallId: sourceCall?.id,
          sourceCallLabel: sourceCall ? formatCallLabel(sourceCall) : undefined,
        }
      }

      if (adherence > 0 && adherence < 70) {
        const sourceCall = findLowestAdherenceCall(calls)
        return {
          id: rep.id,
          name: rep.name,
          reason: "Low adherence",
          detail: "The rep is drifting from the active playbook in reviewed calls.",
          metric: `${adherence}%`,
          type: "percentage" as const,
          sourceCallId: sourceCall?.id,
          sourceCallLabel: sourceCall ? formatCallLabel(sourceCall) : undefined,
        }
      }

      if (deltaStats.delta < 0) {
        const sourceCall = calls[0]
        return {
          id: rep.id,
          name: rep.name,
          reason: "Score regression",
          detail: `Recent calls are down ${Math.abs(deltaStats.delta)} points from the prior window.`,
          metric: String(avgScore),
          type: "score" as const,
          sourceCallId: sourceCall?.id,
          sourceCallLabel: sourceCall ? formatCallLabel(sourceCall) : undefined,
        }
      }

      return null
    })
    .filter((entry): entry is CoachingAlertInsight => Boolean(entry))
    .slice(0, 3)
}

function buildRepSkillInsight(calls: CallRecord[], direction: "strongest" | "weakest") {
  const scoredCalls = getScoredCalls(calls)
  const categoryMap = new Map<string, { scores: number[]; entries: Array<{ dimension: ScoreDimension; call: CallRecord }> }>()

  for (const call of scoredCalls) {
    for (const dimension of call.scoreBreakdown) {
      const current = categoryMap.get(dimension.label) ?? { scores: [], entries: [] }
      current.scores.push(toPercent(dimension.score, dimension.outOf))
      current.entries.push({ dimension, call })
      categoryMap.set(dimension.label, current)
    }
  }

  const sorted = Array.from(categoryMap.entries())
    .map(([label, value]) => {
      const representative = value.entries.find((entry) => entry.dimension.note.trim().length > 0)
      return {
        label,
        score: average(value.scores),
        detail:
          representative?.dimension.note.trim() ||
          `Average across ${value.scores.length} scored dimension${value.scores.length === 1 ? "" : "s"}.`,
        sourceCallId: representative?.call.id,
        sourceCallLabel: representative ? formatCallLabel(representative.call) : undefined,
      }
    })
    .sort((a, b) => (direction === "strongest" ? b.score - a.score : a.score - b.score))

  return sorted[0] ? { ...sorted[0], outOf: 100 } : null
}

function buildMostImprovedCategory(calls: CallRecord[]) {
  const scoredCalls = getScoredCalls(calls)
  const { recent, previous } = splitRecentAndPrevious(scoredCalls)
  const categoryKeys = new Set(
    scoredCalls.flatMap((call) => call.scoreBreakdown.map((dimension) => dimension.label))
  )

  const improvements = Array.from(categoryKeys).map((label) => {
    const recentScores = recent
      .flatMap((call) => call.scoreBreakdown)
      .filter((dimension) => dimension.label === label)
      .map((dimension) => toPercent(dimension.score, dimension.outOf))
    const previousScores = previous
      .flatMap((call) => call.scoreBreakdown)
      .filter((dimension) => dimension.label === label)
      .map((dimension) => toPercent(dimension.score, dimension.outOf))

    const previousAverage = previousScores.length > 0 ? average(previousScores) : average(recentScores)
    const recentAverage = average(recentScores)

    return {
      label,
      score: recentAverage,
      delta: recentAverage - previousAverage,
      change: recentAverage - previousAverage,
      detail: `Recent window improved by +${recentAverage - previousAverage} points.`,
    }
  })

  // Only a real, positive improvement counts - without this, a rep with no
  // previous window to compare against (or one where nothing moved) still
  // got handed whichever category sorted first at a meaningless "+0 points",
  // which reads as an actual (fake) improvement rather than "no data yet."
  return improvements.filter((entry) => entry.delta > 0).sort((a, b) => b.delta - a.delta)[0] ?? null
}

function buildScoreTrend(calls: CallRecord[]): ScoreTrendPoint[] {
  const scoredCalls = getScoredCalls(calls).slice(0, 5).reverse()

  return scoredCalls.map((call, index) => {
    const previous = index === 0 ? call.score : scoredCalls[index - 1]?.score ?? call.score
    return {
      day: call.date,
      score: call.score,
      delta: index === 0 ? 0 : call.score - previous,
    }
  })
}

export function buildManagerAnalytics(reps: RepAssignment[], calls: CallRecord[]): ManagerAnalytics {
  const scoredCalls = getScoredCalls(calls)
  const callsByRepId = buildCallsByRepId(reps, calls)
  const strongestAndWeakest = buildCategoryInsights(calls)
  const scoredChronological = [...scoredCalls].reverse()
  const { recent, previous } = splitRecentAndPrevious(scoredChronological)
  const leaderboardCategories: LeaderboardCategory[] = [
    "overall",
    "discovery",
    "objection-handling",
    "next-step-clarity",
    "playbook-adherence",
    "most-improved",
  ]

  const leaderboard = Object.fromEntries(
    leaderboardCategories.map((category) => [category, buildLeaderboardEntries(reps, callsByRepId, category)])
  ) as Record<LeaderboardCategory, LeaderboardEntry[]>

  const positiveOutcomes = calls.filter((call) => isWinOutcome(call.outcome)).length
  const recentAvgScore = average(recent.map((call) => call.score))
  const previousAvgScore = previous.length > 0 ? average(previous.map((call) => call.score)) : recentAvgScore
  const recentAdherence = average(recent.map((call) => call.adherence))
  const previousAdherence = previous.length > 0 ? average(previous.map((call) => call.adherence)) : recentAdherence
  const recentWinRate = recent.length > 0 ? Math.round((recent.filter((call) => isWinOutcome(call.outcome)).length / recent.length) * 100) : 0
  const previousWinRate =
    previous.length > 0 ? Math.round((previous.filter((call) => isWinOutcome(call.outcome)).length / previous.length) * 100) : recentWinRate

  return {
    metrics: {
      avgScore: average(scoredCalls.map((call) => call.score)),
      adherenceRate: average(scoredCalls.map((call) => call.adherence)),
      callsSubmitted: calls.length,
      topRep: leaderboard.overall[0]?.name ?? "—",
      winRate: calls.length > 0 ? Math.round((positiveOutcomes / calls.length) * 100) : 0,
    },
    changes: {
      avgScore: percentChange(recentAvgScore, previousAvgScore),
      adherenceRate: percentChange(recentAdherence, previousAdherence),
      callsSubmitted: percentChange(recent.length, previous.length || recent.length),
      winRate: percentChange(recentWinRate, previousWinRate),
    },
    sparklines: {
      avgScore: toSparkline(scoredChronological.map((call) => call.score)),
      adherenceRate: toSparkline(scoredChronological.map((call) => call.adherence)),
      callsSubmitted: toSparkline(scoredChronological.map((_, index) => index + 1)),
      winRate: toSparkline(
        scoredChronological.map((call, index) => {
          const window = scoredChronological.slice(0, index + 1)
          return Math.round((window.filter((item) => isWinOutcome(item.outcome)).length / window.length) * 100)
        })
      ),
    },
    strongestCategories: strongestAndWeakest.strongest,
    weakestCategories: strongestAndWeakest.weakest,
    outcomeConversion: buildOutcomeConversion(calls),
    improvements: buildImprovements(reps, callsByRepId),
    coachingAlerts: buildCoachingAlerts(reps, callsByRepId),
    leaderboard,
    wonPatterns: buildPatternInsights(calls, "won"),
    lostPatterns: buildPatternInsights(calls, "lost"),
  }
}

export function buildRepAnalytics(
  currentRep: RepAssignment | null,
  calls: CallRecord[],
  leaderboard: RepAssignment[]
): RepAnalytics {
  const strongestSkill = buildRepSkillInsight(calls, "strongest")
  const weakestSkill = buildRepSkillInsight(calls, "weakest")
  const scoredCalls = getScoredCalls(calls)
  const scoredChronological = [...scoredCalls].reverse()
  const { recent, previous } = splitRecentAndPrevious(scoredChronological)
  const positiveOutcomes = calls.filter((call) => isWinOutcome(call.outcome)).length
  const leaderboardRank = currentRep ? leaderboard.findIndex((rep) => rep.id === currentRep.id) + 1 : 0
  const mostImprovedCategory = buildMostImprovedCategory(calls)
  const avgScore = average(scoredCalls.map((call) => call.score))
  const previousAvgScore = previous.length > 0 ? average(previous.map((call) => call.score)) : avgScore
  const recentClosedWonRate = recent.length > 0 ? Math.round((recent.filter((call) => isWinOutcome(call.outcome)).length / recent.length) * 100) : 0
  const previousClosedWonRate =
    previous.length > 0 ? Math.round((previous.filter((call) => isWinOutcome(call.outcome)).length / previous.length) * 100) : recentClosedWonRate

  return {
    callsSubmitted: calls.length,
    closedWonRate: calls.length > 0 ? Math.round((positiveOutcomes / calls.length) * 100) : 0,
    avgScore,
    strongestSkill,
    weakestSkill,
    playbookAdherenceRate: average(scoredCalls.map((call) => call.adherence)),
    mostImprovedCategory,
    scoreTrend: buildScoreTrend(calls),
    leaderboardRank,
    changes: {
      avgScore: percentChange(avgScore, previousAvgScore),
      callsSubmitted: percentChange(recent.length, previous.length || recent.length),
      leaderboardRank: 0,
      closedWonRate: percentChange(recentClosedWonRate, previousClosedWonRate),
    },
    sparklines: {
      avgScore: toSparkline(scoredChronological.map((call) => call.score)),
      callsSubmitted: toSparkline(scoredChronological.map((_, index) => index + 1)),
      leaderboardRank: toSparkline(Array.from({ length: Math.max(scoredChronological.length, 1) }, () => leaderboardRank || 0), leaderboardRank || 0),
      closedWonRate: toSparkline(
        scoredChronological.map((call, index) => {
          const window = scoredChronological.slice(0, index + 1)
          return Math.round((window.filter((item) => isWinOutcome(item.outcome)).length / window.length) * 100)
        })
      ),
    },
  }
}
