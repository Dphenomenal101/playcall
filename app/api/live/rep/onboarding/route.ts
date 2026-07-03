import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { finalizeUserAccess, getCurrentMembership } from "@/lib/data/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[rep/onboarding] start", { userId: user.id })

  await finalizeUserAccess(supabase as any, user)

  const membership = await getCurrentMembership(supabase as any, user.id)
  console.log("[rep/onboarding] membership after finalize", {
    userId: user.id,
    membershipRole: membership?.role ?? null,
  })
  if (!membership || membership.role !== "rep") {
    return NextResponse.json({ error: "Rep access required" }, { status: 403 })
  }

  const body = await request.json()
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : ""

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 })
  }

  console.log("[rep/onboarding] requested name save", { userId: user.id })

  const admin = createAdminClient()
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )

  if (profileError) {
    console.log("[rep/onboarding] profile upsert failed", { userId: user.id, error: profileError.message })
    return NextResponse.json({ error: profileError.message ?? "Unable to update rep profile" }, { status: 400 })
  }

  const { data: savedProfile, error: savedProfileError } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle()

  if (savedProfileError || !savedProfile?.full_name?.trim()) {
    console.log("[rep/onboarding] profile verify failed", {
      userId: user.id,
      error: savedProfileError?.message ?? null,
    })
    return NextResponse.json(
      { error: savedProfileError?.message ?? "Unable to verify rep profile" },
      { status: 400 }
    )
  }

  console.log("[rep/onboarding] profile saved", { userId: user.id })

  void admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        full_name: fullName,
        name: fullName,
      },
    })

  console.log("[rep/onboarding] success", { userId: user.id })

  return NextResponse.json({ ok: true, redirectPath: "/rep" })
}
