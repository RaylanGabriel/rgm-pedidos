import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { and, eq, gt } from "drizzle-orm"
import { db } from "@/db"
import { sessions, storeMembers, stores, users } from "@/db/schema"

export const SESSION_COOKIE = "sid"
const SESSION_DAYS = 30

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

export async function createSession(userId: string, activeStoreId: string | null) {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await db.insert(sessions).values({ id: hashToken(token), userId, activeStoreId, expiresAt })

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  })
}

export async function deleteSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
  jar.delete(SESSION_COOKIE)
}

/** Sessão atual (ou null). Memorizada por requisição com React cache. */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null

  const [row] = await db
    .select({
      sessionId: sessions.id,
      activeStoreId: sessions.activeStoreId,
      user: { id: users.id, email: users.email, name: users.name, isSuperadmin: users.isSuperadmin },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)

  return row ?? null
})

/** Exige usuário logado; senão manda para o login. */
export async function requireSession() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  return session
}

/**
 * Exige usuário logado E com acesso à loja ativa da sessão.
 * Use em toda página/ação do painel: o `store.id` retornado é o filtro de todas as consultas.
 */
export const requireStore = cache(async () => {
  const session = await requireSession()
  if (!session.activeStoreId) redirect("/admin/sem-loja")

  const [row] = await db
    .select({ store: stores, role: storeMembers.role })
    .from(stores)
    .leftJoin(storeMembers, and(eq(storeMembers.storeId, stores.id), eq(storeMembers.userId, session.user.id)))
    .where(eq(stores.id, session.activeStoreId))
    .limit(1)

  // Precisa ser membro da loja, ou superadmin da plataforma
  if (!row || (!row.role && !session.user.isSuperadmin)) redirect("/admin/sem-loja")

  return { user: session.user, store: row.store, role: row.role ?? ("owner" as const) }
})

/** Como requireStore(), mas só para o dono da loja (ou superadmin). Funcionário vai para o painel. */
export async function requireOwner() {
  const ctx = await requireStore()
  if (ctx.role !== "owner" && !ctx.user.isSuperadmin) redirect("/admin")
  return ctx
}

/** Para server actions: devolve null em vez de redirecionar quando não é dono. */
export async function isOwner() {
  const ctx = await requireStore()
  return ctx.role === "owner" || ctx.user.isSuperadmin ? ctx : null
}
