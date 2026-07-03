import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getLiveViewerContext } from "@/lib/data/live-workspace"
import { createAdminClient } from "@/lib/supabase/admin"

export async function PATCH(request: Request) {
  const context = await getLiveViewerContext("rep")

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await request.json().catch(() => null)
  const fullName = typeof body?.name === "string" ? body.name.trim() : ""

  if (!fullName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: context.viewer.id,
        email: context.viewer.email,
        full_name: fullName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )

  if (profileError) {
    return NextResponse.json({ error: profileError.message ?? "Unable to update profile" }, { status: 400 })
  }

  const { data: savedProfile, error: savedProfileError } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", context.viewer.id)
    .maybeSingle()

  if (savedProfileError || !savedProfile?.full_name?.trim()) {
    return NextResponse.json(
      { error: savedProfileError?.message ?? "Unable to verify profile" },
      { status: 400 }
    )
  }

  void admin.auth.admin.updateUserById(context.viewer.id, {
      user_metadata: {
        full_name: fullName,
        name: fullName,
      },
    })

  revalidateTag(`workspace-${context.workspaceId}`, "max")
  return NextResponse.json({
    viewer: {
      ...context.viewer,
      name: fullName,
    },
  })
}
