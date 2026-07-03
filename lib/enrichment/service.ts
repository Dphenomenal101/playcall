import { getWorkspaceProviderRuntimeConfig } from "../ai/providers"
import { enrichAccountContextWithExa } from "./exa-provider"

export async function enrichAccountContext(input: Parameters<typeof enrichAccountContextWithExa>[0]) {
  const config = await getWorkspaceProviderRuntimeConfig(input.workspaceId, "enrichment")
  const providerId = config?.providerId ?? "exa"

  switch (providerId) {
    case "exa":
      return enrichAccountContextWithExa(input)
    default:
      throw new Error(`Unsupported enrichment provider: ${providerId}`)
  }
}
