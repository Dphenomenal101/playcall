// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { processJobById } from "./_vendor/lib/jobs/processors.ts"

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Supabase gateway already verified the JWT signature via verify_jwt.
  // We just need to confirm the caller used the service role key (role=service_role)
  // rather than a regular user session token (role=authenticated), so that
  // arbitrary logged-in users cannot trigger rubric generation for any jobId.
  const authHeader = req.headers.get("authorization") ?? ""
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim()
  let jwtRole = ""
  try {
    const payloadB64 = jwt.split(".")[1] ?? ""
    // base64url → base64: swap chars then pad to a multiple of 4
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
    jwtRole = (JSON.parse(atob(padded))?.role ?? "") as string
  } catch {
    // malformed JWT - deny
  }

  if (jwtRole !== "service_role") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const jobId = typeof body?.jobId === "string" ? body.jobId : ""

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing jobId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    await processJobById(jobId)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process job"
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
})
