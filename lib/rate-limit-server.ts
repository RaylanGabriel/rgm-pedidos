import "server-only"

import { headers } from "next/headers"
import { and, count, eq, gt } from "drizzle-orm"
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

/**
 * IP para os LIMITES: IPv4 inteiro; IPv6 só os primeiros 64 bits (/64). Um provedor entrega um /64 inteiro para cada
 * cliente — trocar o fim do endereço é de graça, então limitar por IPv6 completo não limitaria nada.
 */
export async function clientIpKey() {
  return ipBucket(await clientIp())
}

export function ipBucket(ip: string) {
  if (!ip.includes(":")) return ip
  // IPv4 escrito como IPv6 (::ffff:1.2.3.4): é um IPv4, conta inteiro (senão todos cairiam no mesmo grupo)
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) return mapped[1]
  const [head, tail = ""] = ip.toLowerCase().split("%")[0].split("::")
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  const missing = 8 - left.length - right.length
  if (ip.includes("::") && missing < 0) return ip // endereço malformado: usa como veio (nunca derruba a requisição)
  const full = ip.includes("::") ? [...left, ...Array(missing).fill("0"), ...right] : left
  return `${full.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, "")).join(":")}::/64`
}

/** Quantas batidas a chave teve dentro da janela. */
export async function hits(key: string, windowMs: number) {
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, new Date(Date.now() - windowMs))))
  return row?.n ?? 0
}

/** Registra batidas. A faxina do que tem mais de 1 dia fica no cron (lib/maintenance.ts), não em cada batida. */
export async function recordHits(...keys: string[]) {
  await db.insert(loginAttempts).values(keys.map((key) => ({ key })))
}

/** Verifica e já registra: retorna false se a chave estourou o limite. */
export async function rateLimit(key: string, max: number, windowMs: number) {
  // Grava ANTES de contar: N pedidos simultâneos gravam os N e cada um conta pelo menos os que já gravaram, então
  // nunca passam mais que `max` (contar antes de gravar deixava todos verem o mesmo número e passarem juntos).
  const [mine] = await db.insert(loginAttempts).values({ key }).returning({ id: loginAttempts.id })
  if ((await hits(key, windowMs)) <= max) return true
  // Recusado não ocupa vaga: apaga a própria batida. Senão um atacante mandando de propósito pedidos com o e-mail de
  // alguém (ex.: código de login) manteria a chave da vítima sempre cheia, bloqueada para sempre.
  await db.delete(loginAttempts).where(eq(loginAttempts.id, mine.id))
  return false
}
