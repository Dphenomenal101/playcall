import { NextResponse } from "next/server"
import { getLiveRepWorkspaceData } from "@/lib/data/live-workspace"

export async function GET() {
  const data = await getLiveRepWorkspaceData()
  return NextResponse.json(data)
}
