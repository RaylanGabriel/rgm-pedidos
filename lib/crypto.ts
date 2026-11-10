import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Criptografia dos tokens do Mercado Pago no banco (AES-256-GCM).
 * Chave: MP_TOKEN_KEY = 32 bytes em base64. Sem a chave, um vazamento do banco não expõe as contas das lojas.
 * Formato guardado: "v1.<iv>.<tag>.<dados>" (base64url).
 */
function key() {
  const raw = process.env.MP_TOKEN_KEY
  const buf = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0)
  if (buf.length !== 32) throw new Error("MP_TOKEN_KEY ausente ou inválida (precisa de 32 bytes em base64)")
  return buf
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".")
}

export function decryptSecret(stored: string) {
  const [v, iv, tag, data] = stored.split(".")
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato desconhecido")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
}
