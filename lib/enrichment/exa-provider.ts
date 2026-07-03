import { z } from "zod"
import { generateStructuredObject, getWorkspaceProviderRuntimeConfig } from "../ai/providers"
import { createExaClient } from "../integrations/exa"
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
  return [
    "Normalize the buyer and account context for a B2B sales call.",
    "Prefer evidence from LinkedIn URL first, then email, then company/domain context.",
    "Return only what is supported by the evidence. Use unknown/null when unsure.",
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
    "Contact search results:",
    JSON.stringify(input.contactResults),
  ].join("\n")
}

export async function enrichAccountContextWithExa(input: {
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
  const exaApiKey =
    typeof config?.credentials.apiKey === "string" ? config.credentials.apiKey.trim() : readRuntimeEnv("EXA_API_KEY")?.trim()

  if (!exaApiKey) {
    throw new Error("Missing Exa API key")
  }

  console.log("[exa] using provider config", {
    workspaceId: input.workspaceId,
    source: config?.source ?? "env",
    providerId: config?.providerId ?? "exa",
  })

  const exa = createExaClient(exaApiKey)

  const [companyResults, contactResults] = await Promise.all([
    exa.searchAndContents(input.companyDomain || input.companyName, {
      category: "company",
      type: "auto",
      highlights: true,
      text: true,
      numResults: 5,
    } as any),
    exa.searchAndContents(input.linkedinUrl || `${input.contactName} ${input.companyName}`, {
      category: "people",
      type: "auto",
      highlights: true,
      text: true,
      numResults: 5,
    } as any),
  ])

  const { object } = await generateStructuredObject({
    workspaceId: input.workspaceId,
    schema: accountContextSchema,
    schemaName: "account_context",
    schemaDescription: "Normalized company and buyer context for buyer-aware scoring.",
    prompt: buildAccountContextPrompt({
      ...input,
      companyResults,
      contactResults,
    }),
  })

  const sourceUrls = [
    ...((companyResults as any)?.results ?? []).map((result: any) => result.url).filter(Boolean),
    ...((contactResults as any)?.results ?? []).map((result: any) => result.url).filter(Boolean),
  ]

  return {
    accountContext: object,
    sourceUrls,
    rawOutput: {
      companyResults,
      contactResults,
    },
  }
}
