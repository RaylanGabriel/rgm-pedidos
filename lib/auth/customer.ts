import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { cache } from "react"
import { cookies, headers } from "next/headers"
import { and, eq, gt, sql } from "drizzle-orm"
import { db } from "@/db"
import { customerSessions, customers } from "@/db/schema"
import { cleanHost, ROOT_DOMAIN } from "@/lib/domains"

/*
 * Sessão do CLIENTE (conta opcional). Separada da equipe (`sid`/`sessions`): uma sessão de cliente nunca abre o
 * painel. O cookie vale para todas as lojas (`Domain=.rgm.dev.br`), porque a conta é uma só para a plataforma.
 * No preview (workers.dev) ele fica só no host, e as lojas são por caminho (/loja/<slug>), então funciona igual.
 */

export const CUSTOMER_COOKIE = "csid"
const SESSION_DAYS = 90

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

/** `.rgm.dev.br` quando o site está no domínio da plataforma; senão o cookie fica só neste host. */
export async function cookieDomain() {
  const host = cleanHost((await headers()).get("host"))
  return ROOT_DOMAIN && (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)) ? `.${ROOT_DOMAIN}` : undefined
}

export async function createCustomerSession(customerId: string) {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(customerSessions).values({ id: hashToken(token), customerId, expiresAt })
  await db.update(customers).set({ lastLoginAt: new Date() }).where(eq(customers.id, customerId))
  ;(await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: await cookieDomain(),
    expires: expiresAt,
  })
}

export type Customer = typeof customers.$inferSelect

/** Cliente logado (ou null). Uma consulta por requisição. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value
  if (!token) return null
  const [row] = await db
    .select({ customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(and(eq(customerSessions.id, hashToken(token)), gt(customerSessions.expiresAt, new Date())))
  return row?.customer ?? null
})

/** Sair: apaga a sessão no banco e o cookie (nos dois escopos, por garantia). */
export async function deleteCustomerSession() {
  const jar = await cookies()
  const token = jar.get(CUSTOMER_COOKIE)?.value
  if (token) await db.delete(customerSessions).where(eq(customerSessions.id, hashToken(token)))
  const domain = await cookieDomain()
  jar.set(CUSTOMER_COOKIE, "", { path: "/", domain, expires: new Date(0) })
  if (domain) jar.set(CUSTOMER_COOKIE, "", { path: "/", expires: new Date(0) })
}

/**
 * Acha ou cria a conta pelo e-mail (já verificado: código ou Google). Com Google, liga o `sub` à conta.
 * O e-mail é a chave: entrar por código ou por Google com o mesmo e-mail cai na mesma conta.
 */
export async function upsertCustomer(email: string, opts: { googleSub?: string; name?: string | null } = {}) {
  const normalized = email.trim().toLowerCase()
  const [existing] = await db.select().from(customers).where(sql`lower(${customers.email}) = ${normalized}`)
  if (existing) {
    const patch: Partial<Customer> = {}
    if (opts.googleSub && !existing.googleSub) patch.googleSub = opts.googleSub
    if (opts.name && !existing.name) patch.name = opts.name
    if (Object.keys(patch).length) await db.update(customers).set(patch).where(eq(customers.id, existing.id))
    return existing.id
  }
  const [created] = await db
    .insert(customers)
    .values({ email: normalized, googleSub: opts.googleSub ?? null, name: opts.name ?? null })
    .returning({ id: customers.id })
  return created.id
}
