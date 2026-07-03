import { NextResponse } from "next/server"
import { getLiveManagerWorkspaceData } from "@/lib/data/live-workspace"

export async function GET() {
  const data = await getLiveManagerWorkspaceData()
  return NextResponse.json(data)
}
