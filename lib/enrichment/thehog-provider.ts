import { z } from "zod"
import { generateStructuredObject, getWorkspaceProviderRuntimeConfig } from "../ai/providers"
import { getTheHogCredentials, searchCompany, enrichContact } from "../integrations/thehog"
import type { AccountContext } from "../playcall-data"
import { readRuntimeEnv } from "../runtime/env"

const accountContextSchema = z.object({
  company: z.object({
    name: z.string().nullable(),
    domain: z.string(),
    employeeBand: z.enum(["1-10", "11-50", "51-200", "201-1000", "1000+"]).nullable(),
    stage: z.enum(["bootstrapped", "pre-seed", "seed", "series-a", "series-b-plus", "public", "unknown"]),
    industry: z.string().nullable(),
    businessModel: z.enum(["b2b-saas", "b2c", "marketplace", "services", "developer-tools", "other"]).nullable(),
    salesMotion: z.enum(["plg", "sales-led", "hybrid", "enterprise", "unknown"]),
    pricingModel: z.enum(["self-serve", "sales-assisted", "enterprise", "usage-based", "unknown"]),
    productSummary: z.string().nullable(),
    targetCustomer: z.string().nullable(),
    likelyUseCase: z.string().nullable(),
    relevantTechnologies: z.array(z.string()),
    recentSignals: z.array(
      z.object({
        type: z.enum(["funding", "hiring", "product-launch", "expansion", "partnership", "leadership-change", "other"]),
        description: z.string(),
        date: z.string().nullable(),
      })
    ),
    buyingStageHypothesis: z.enum(["unaware", "problem-aware", "solution-aware", "vendor-evaluating", "committed", "unknown"]),
  }),
  contact: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    title: z.string().nullable(),
    department: z.string().nullable(),
    seniority: z.enum(["individual-contributor", "manager", "director", "vp", "c-suite", "founder", "unknown"]),
    likelyRoleInPurchase: z.enum(["user", "champion", "evaluator", "decision-maker", "economic-buyer", "unknown"]),
  }),
  confidence: z.object({
    company: z.number(),
    contact: z.number(),
    stage: z.number(),
    salesMotion: z.number(),
  }),
  sources: z.object({
    company: z.array(z.string()),
    contact: z.array(z.string()),
    retrievedAt: z.string(),
  }),
})

function extractDomainFromWebResults(companyResults: unknown): string | null {
  if (
    typeof companyResults !== "object" ||
    companyResults === null ||
    (companyResults as Record<string, unknown>).source !== "web_search"
  ) {
    return null
  }
  const results = (companyResults as { results?: Array<{ url?: string }> }).results
  const firstUrl = results?.[0]?.url
  if (!firstUrl) return null
  try {
    return new URL(firstUrl).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

function buildAccountContextPrompt(input: {
  companyName: string
  companyDomain: string
  contactName: string
  contactEmail: string
  linkedinUrl: string
  contactRole: string
  companyResults: unknown
  contactResults: unknown
}) {
  const isWebSearch =
    typeof input.companyResults === "object" &&
    input.companyResults !== null &&
    (input.companyResults as Record<string, unknown>).source === "web_search"

  const lines = [
    "Normalize the buyer and account context for a B2B sales call.",
    "Prefer evidence from LinkedIn URL first, then email, then company/domain context.",
    "Return only what is supported by the evidence. Use unknown/null when unsure.",
  ]

  if (isWebSearch) {
    lines.push(
      "Company search results are live web search snippets (not a structured database).",
      "Extract the company domain from the first result URL (e.g. retellai.com from https://www.retellai.com/).",
      "Infer stage signals: YCombinator URL → seed or series-a; Crunchbase with funding mentions → funded startup.",
      "Infer salesMotion from product description: self-serve platform → plg or hybrid; enterprise pricing/custom → sales-led.",
      "Use snippet content to estimate employeeBand and industry even if not stated explicitly."
    )
  }

  lines.push(
    `Company name: ${input.companyName || "unknown"}`,
    `Company domain: ${input.companyDomain || "unknown"}`,
    `Contact name: ${input.contactName || "unknown"}`,
    `Contact email: ${input.contactEmail || "unknown"}`,
    `Contact role: ${input.contactRole || "unknown"}`,
    `LinkedIn URL: ${input.linkedinUrl}`,
    "",
    "Company search results:",
    JSON.stringify(input.companyResults),
    "",
    "Contact enrichment results:",
    JSON.stringify(input.contactResults),
  )

  return lines.join("\n")
}

export async function enrichAccountContextWithTheHog(input: {
  workspaceId: string
  companyName: string
  companyDomain: string
  contactName: string
  contactEmail: string
  linkedinUrl: string
  contactRole: string
}): Promise<{
  accountContext: AccountContext
  sourceUrls: string[]
  rawOutput: Record<string, unknown>
}> {
  const config = await getWorkspaceProviderRuntimeConfig(input.workspaceId, "enrichment")
  const accessKey =
    typeof config?.credentials?.accessKey === "string" ? config.credentials.accessKey.trim() : readRuntimeEnv("THEHOG_ACCESS_KEY")?.trim()
  const secretKey =
    typeof config?.credentials?.secretKey === "string" ? config.credentials.secretKey.trim() : readRuntimeEnv("THEHOG_SECRET_KEY")?.trim()

  const creds = getTheHogCredentials({ accessKey, secretKey })

  console.log("[thehog] using provider config", {
    workspaceId: input.workspaceId,
    source: config?.source ?? "env",
    providerId: config?.providerId ?? "thehog",
  })

  const companyQuery = input.companyName || input.companyDomain
  const companyDomain =
    input.companyDomain ||
    (input.contactEmail?.includes("@") ? input.contactEmail.split("@")[1] : undefined)

  const identifier: { linkedin_url?: string; email?: string } = {}
  if (input.linkedinUrl) identifier.linkedin_url = input.linkedinUrl
  else if (input.contactEmail) identifier.email = input.contactEmail

  const [companyResults, contactResults] = await Promise.all([
    searchCompany(creds, companyQuery, companyDomain).catch((err) => {
      console.warn("[thehog] company search failed, continuing without:", err?.message)
      return null
    }),
    Object.keys(identifier).length > 0
      ? enrichContact(creds, identifier).catch((err) => {
          console.warn("[thehog] contact enrichment failed, continuing without:", err?.message)
          return null
        })
      : Promise.resolve(null),
  ])

  const effectiveDomain = input.companyDomain || extractDomainFromWebResults(companyResults) || ""

  const { object } = await generateStructuredObject({
    workspaceId: input.workspaceId,
    schema: accountContextSchema,
    schemaName: "account_context",
    schemaDescription: "Normalized company and buyer context for buyer-aware scoring.",
    prompt: buildAccountContextPrompt({
      ...input,
      companyDomain: effectiveDomain,
      companyResults,
      contactResults,
    }),
  })

  return {
    accountContext: object,
    sourceUrls: [],
    rawOutput: {
      companyResults,
      contactResults,
    },
  }
}
