import { NextResponse } from "next/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { validateProviderApiKey } from "@/lib/ai/validate-provider"

export async function POST(request: Request) {
  const context = await getLiveViewerContext("manager")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const providerId = typeof body?.providerId === "string" ? body.providerId : ""
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey : ""
  const secretKey = typeof body?.secretKey === "string" ? body.secretKey : undefined
  const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : undefined

  if (!providerId) {
    return NextResponse.json({ error: "Missing providerId" }, { status: 400 })
  }

  const result = await validateProviderApiKey(providerId, apiKey, { secretKey, baseUrl })
  return NextResponse.json(result)
}
