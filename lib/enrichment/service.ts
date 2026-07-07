import { getWorkspaceProviderRuntimeConfig } from "../ai/providers"
import { enrichAccountContextWithExa } from "./exa-provider"
import { enrichAccountContextWithTheHog } from "./thehog-provider"

export async function enrichAccountContext(input: Parameters<typeof enrichAccountContextWithExa>[0]) {
  const config = await getWorkspaceProviderRuntimeConfig(input.workspaceId, "enrichment")
  const providerId = config?.providerId ?? "exa"

  switch (providerId) {
    case "exa": {
      const result = await enrichAccountContextWithExa(input)
      return { ...result, providerId: "exa" as const }
    }
    case "thehog": {
      const result = await enrichAccountContextWithTheHog(input)
      return { ...result, providerId: "thehog" as const }
    }
    default:
      throw new Error(`Unsupported enrichment provider: ${providerId}`)
  }
}
