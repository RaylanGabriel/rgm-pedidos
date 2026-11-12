"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { sessions, storeMembers, users } from "@/db/schema"
import { generateTempPassword, hashPassword } from "@/lib/auth/password"
import { isOwner } from "@/lib/auth/session"
import { formText, zodErrorState, type FormState } from "@/lib/form-state"

/**
 * Equipe da loja: o dono cria e gerencia o login dos funcionários.
 * O dono só mexe em FUNCIONÁRIOS desta loja — nunca em outro dono, nunca em si mesmo — para não poder assumir a conta
 * de alguém que também é dono (talvez de outra loja). Isso fica com o superadmin (tela Lojas).
 */

const newStaffSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(100, "Nome muito longo"),
  email: z.string().email("E-mail inválido").max(255).transform((v) => v.toLowerCase()),
})

const uuidSchema = z.string().uuid()

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ("code" in e ? e.code : (e as { cause?: { code?: string } }).cause?.code) === "23505"

export async function addStaffAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return { error: "Só o dono da loja gerencia a equipe." }

  const parsed = newStaffSchema.safeParse({ name: formText(fd, "name"), email: formText(fd, "email") })
  if (!parsed.success) return zodErrorState(parsed.error)
  const v = parsed.data

  const [existing] = await db
    .select({ id: users.id, name: users.name, role: storeMembers.role })
    .from(users)
    .leftJoin(storeMembers, and(eq(storeMembers.userId, users.id), eq(storeMembers.storeId, ctx.store.id)))
    .where(eq(sql`lower(${users.email})`, v.email))
    .limit(1)
  if (existing?.role) return { fieldErrors: { email: "Essa pessoa já faz parte da equipe." } }

  const userId = existing?.id ?? randomUUID()
  const tempPassword = existing ? null : generateTempPassword()
  const addMember = db.insert(storeMembers).values({ userId, storeId: ctx.store.id, role: "staff" })
  try {
    if (tempPassword) {
      // Conta nova + vínculo na mesma transação
      const passwordHash = await hashPassword(tempPassword)
      await db.batch([db.insert(users).values({ id: userId, email: v.email, name: v.name, passwordHash, mustChangePassword: true }), addMember])
    } else {
      await addMember
    }
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Esse e-mail acabou de ser cadastrado. Atualize a página e confira a lista." }
    throw e
  }

  revalidatePath("/admin/equipe")
  return {
    ok: true,
    message: existing
      ? `${existing.name} já tinha conta e agora faz parte da equipe: entra no painel com a senha que já usa.`
      : `${v.name} foi adicionado(a). Passe o endereço do painel, o e-mail ${v.email} e a senha provisória abaixo (troca no primeiro acesso).`,
    secret: tempPassword ?? undefined,
  }
}

/** Funcionário desta loja (não dono, não você). Devolve também em quantas OUTRAS lojas ele está. */
async function staffMember(storeId: string, selfId: string, userId: string) {
  if (!uuidSchema.safeParse(userId).success || userId === selfId) return null
  const [m] = await db
    .select({
      email: users.email,
      name: users.name,
      isSuperadmin: users.isSuperadmin,
      otherStores: sql<number>`(SELECT count(*)::int FROM ${storeMembers} o WHERE o.user_id = ${users.id} AND o.store_id <> ${storeId})`,
    })
    .from(storeMembers)
    .innerJoin(users, eq(users.id, storeMembers.userId))
    .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId), eq(storeMembers.role, "staff")))
    .limit(1)
  return m ?? null
}

/** Nova senha provisória para um funcionário que esqueceu a dele; desconecta os aparelhos dele. */
export async function resetStaffPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return { error: "Só o dono da loja gerencia a equipe." }
  const userId = formText(fd, "userId")
  const m = await staffMember(ctx.store.id, ctx.user.id, userId)
  if (!m) return { error: "Funcionário não encontrado." }
  // A senha vale para todas as lojas da pessoa: se ela trabalha em outra, só o suporte troca
  if (m.otherStores > 0 || m.isSuperadmin) return { error: "Essa pessoa também usa o sistema em outra loja. Peça a nova senha ao suporte." }

  const tempPassword = generateTempPassword()
  await db.batch([
    db.update(users).set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true }).where(eq(users.id, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
  ])
  revalidatePath("/admin/equipe")
  return { ok: true, message: `Nova senha provisória de ${m.name} (${m.email}), trocada no primeiro acesso:`, secret: tempPassword }
}

/**
 * Tira o funcionário da equipe e encerra as sessões dele nesta loja na hora.
 * Se ele não estiver em nenhuma outra loja, a conta é apagada (o e-mail pode ser adicionado de novo depois).
 */
export async function removeStaffAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return { error: "Só o dono da loja gerencia a equipe." }
  const userId = formText(fd, "userId")
  const m = await staffMember(ctx.store.id, ctx.user.id, userId)
  if (!m) return { error: "Funcionário não encontrado." }

  if (m.otherStores === 0 && !m.isSuperadmin) {
    await db.delete(users).where(eq(users.id, userId)) // vínculo e sessões saem junto (cascade)
  } else {
    await db.batch([
      db.delete(storeMembers).where(and(eq(storeMembers.storeId, ctx.store.id), eq(storeMembers.userId, userId))),
      db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.activeStoreId, ctx.store.id))),
    ])
  }
  revalidatePath("/admin/equipe")
  return { ok: true, message: `${m.name} não tem mais acesso a esta loja.` }
}
