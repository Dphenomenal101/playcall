import { readRuntimeEnv } from "../runtime/env"

// Next.js only inlines NEXT_PUBLIC_* vars into the browser bundle when they
// appear as a static, literal `process.env.NEXT_PUBLIC_X` reference - a
// dynamic/bracket lookup like `process.env[key]` (what readRuntimeEnv does)
// is invisible to that build-time replacement, so in the browser it always
// resolves to undefined regardless of what .env.local actually contains.
// Server code doesn't have this restriction (real process.env at runtime),
// but these two specifically must be referenced literally to work in both.
const requiredPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || readRuntimeEnv("SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || readRuntimeEnv("SUPABASE_ANON_KEY"),
}

function getEnvValue(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing required Supabase environment variable: ${key}`)
  }

  return value
}

export function getSupabaseUrl() {
  return getEnvValue(requiredPublicEnv.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL")
}

export function getSupabaseAnonKey() {
  return getEnvValue(requiredPublicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export function getSupabaseServiceRoleKey() {
  return getEnvValue(readRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY"), "SUPABASE_SERVICE_ROLE_KEY")
}

export function hasSupabaseEnv() {
  return Boolean(requiredPublicEnv.NEXT_PUBLIC_SUPABASE_URL && requiredPublicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function hasSupabaseClientEnv() {
  return hasSupabaseEnv()
}
