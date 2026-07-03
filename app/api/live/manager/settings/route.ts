import { NextResponse } from "next/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/data/live-settings"

export async function GET() {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const data = await getWorkspaceSettings(context.workspaceId, context.viewer)
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load settings" },
      { status: 400 }
    )
  }
}

export async function PATCH(request: Request) {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  try {
    const data = await saveWorkspaceSettings({
      workspaceId: context.workspaceId,
      userId: context.viewer.id,
      fullName: String(body.fullName ?? ""),
      workspaceName: String(body.workspaceName ?? ""),
      companyDomain: String(body.companyDomain ?? ""),
      selections: {
        primaryLlmProvider: String(body.selections?.primaryLlmProvider ?? "openai"),
        fallbackLlmProvider: String(body.selections?.fallbackLlmProvider ?? "anthropic"),
        enrichmentProvider: String(body.selections?.enrichmentProvider ?? "exa"),
        documentParsingProvider: String(body.selections?.documentParsingProvider ?? "llamaparse"),
      },
      providerConfigs: Array.isArray(body.providerConfigs) ? body.providerConfigs : [],
    })

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save settings" },
      { status: 400 }
    )
  }
}
