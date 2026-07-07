import { getWorkspaceProviderRuntimeConfig } from "../ai/providers.ts"
import { enrichAccountContextWithExa } from "./exa-provider.ts"
import { enrichAccountContextWithTheHog } from "./thehog-provider.ts"

export async function enrichAccountContext(input: Parameters<typeof enrichAccountContextWithExa>[0]) {
  const config = await getWorkspaceProviderRuntimeConfig(input.workspaceId, "enrichment")
  const providerId = config?.providerId ?? "exa"

  switch (providerId) {
    case "exa":
      return enrichAccountContextWithExa(input)
    case "thehog":
      return enrichAccountContextWithTheHog(input)
    default:
      throw new Error(`Unsupported enrichment provider: ${providerId}`)
  }
}
