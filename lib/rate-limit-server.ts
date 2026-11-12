import "server-only"

import { headers } from "next/headers"
import { and, count, eq, gt, lt } from "drizzle-orm"
import { db } from "@/db"
import { loginAttempts } from "@/db/schema"

/*
 * Limite de requisições guardado no banco (funciona mesmo com várias instâncias do Worker).
 * Reaproveita a tabela login_attempts como registro genérico de "batidas" por chave.
 */

/**
 * IP do visitante. Na Cloudflare só vale o `cf-connecting-ip`: a própria Cloudflare o define e sobrescreve o que o
 * visitante mandar. O `x-forwarded-for` NÃO serve: a Cloudflare acrescenta o IP real no fim e mantém o primeiro valor
 * como veio do visitante, então dava para inventar um IP a cada requisição e escapar dos limites.
 * Fora da Cloudflare (`next dev`) não há o cabeçalho: todos contam como "unknown", o que só importa localmente.
 */
export async function clientIp() {
  return (await headers()).get("cf-connecting-ip")?.trim() || "unknown"
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
