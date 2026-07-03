import { Buffer } from "node:buffer"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { readRuntimeEnv } from "../runtime/env"

const ENCRYPTION_ALGORITHM = "aes-256-gcm"

function getWorkspaceSecretsKey() {
  const raw = readRuntimeEnv("WORKSPACE_SECRETS_ENCRYPTION_KEY")?.trim()

  if (!raw) {
    throw new Error("Missing WORKSPACE_SECRETS_ENCRYPTION_KEY")
  }

  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error("WORKSPACE_SECRETS_ENCRYPTION_KEY must decode to 32 bytes")
  }

  return key
}

export interface EncryptedPayload {
  iv: string
  ciphertext: string
  tag: string
}

export function encryptWorkspaceSecret(value: Record<string, unknown>): EncryptedPayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getWorkspaceSecretsKey(), iv)
  const serialized = JSON.stringify(value)
  const ciphertext = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  }
}

export function decryptWorkspaceSecret(input: Partial<EncryptedPayload> | null | undefined) {
  if (!input?.iv || !input.ciphertext || !input.tag) {
    return {}
  }

  try {
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      getWorkspaceSecretsKey(),
      Buffer.from(input.iv, "base64")
    )
    decipher.setAuthTag(Buffer.from(input.tag, "base64"))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8")

    return JSON.parse(decrypted) as Record<string, unknown>
  } catch {
    return {}
  }
}
