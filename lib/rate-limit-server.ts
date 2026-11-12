import "server-only"

import { headers } from "next/headers"
import { and, count, eq, gt, lt } from "drizzle-orm"
import { db } from "@/db"
import { loginAttempts } from "@/db/schema"

/*
 * Limite de requisições guardado no banco (funciona mesmo com várias instâncias do Worker).
 * Reaproveita a tabela login_attempts como registro genérico de "batidas" por chave.
 */

export async function clientIp() {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
}

/** Quantas batidas a chave teve dentro da janela. */
export async function hits(key: string, windowMs: number) {
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, new Date(Date.now() - windowMs))))
  return row?.n ?? 0
}

/** Registra batidas e faz a faxina do que tem mais de 1 dia. */
export async function recordHits(...keys: string[]) {
  await db.insert(loginAttempts).values(keys.map((key) => ({ key })))
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
}

/** Verifica e já registra: retorna false se a chave estourou o limite. */
export async function rateLimit(key: string, max: number, windowMs: number) {
  if ((await hits(key, windowMs)) >= max) return false
  await recordHits(key)
  return true
}
