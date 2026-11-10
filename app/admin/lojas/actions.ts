"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { categories, sessions, storeMembers, stores, users } from "@/db/schema"
import { generateTempPassword, hashPassword } from "@/lib/auth/password"
import { requireSuperadmin, setActiveStore } from "@/lib/auth/session"
import { formText, zodErrorState, type FormState } from "@/lib/form-state"
import { SLUG_RE } from "@/lib/slug"

/** Categorias criadas numa loja nova (o dono renomeia/apaga à vontade). */
const STARTER_CATEGORIES = ["Lanches", "Porções", "Bebidas", "Sobremesas"]

const newStoreSchema = z.object({
  storeName: z.string().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  slug: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(40, "Máximo 40 caracteres")
    .regex(SLUG_RE, "Use só letras minúsculas, números e hífen (ex.: dogao-do-ze)"),
  ownerName: z.string().min(2, "Nome muito curto").max(100, "Nome muito longo"),
  ownerEmail: z.string().email("E-mail inválido").max(255).transform((v) => v.toLowerCase()),
  starter: z.boolean(),
})

const uuidSchema = z.string().uuid()

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ("code" in e ? e.code : (e as { cause?: { code?: string } }).cause?.code) === "23505"

export async function createStoreAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSuperadmin()

  const parsed = newStoreSchema.safeParse({
    storeName: formText(fd, "storeName"),
    slug: formText(fd, "slug").toLowerCase(),
    ownerName: formText(fd, "ownerName"),
    ownerEmail: formText(fd, "ownerEmail"),
    starter: fd.get("starter") === "on",
  })
  if (!parsed.success) return zodErrorState(parsed.error)
  const v = parsed.data

  const [taken] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, v.slug)).limit(1)
  if (taken) return { fieldErrors: { slug: "Esse endereço já está em uso." } }

  const [existing] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(sql`lower(${users.email})`, v.ownerEmail))
    .limit(1)

  // IDs gerados aqui para criar tudo numa única transação (db.batch)
  const storeId = randomUUID()
  const userId = existing?.id ?? randomUUID()
  const tempPassword = existing ? null : generateTempPassword()

  try {
    await db.batch([
      db.insert(stores).values({ id: storeId, slug: v.slug, name: v.storeName }),
      ...(tempPassword
        ? [
            db.insert(users).values({
              id: userId,
              email: v.ownerEmail,
              name: v.ownerName,
              passwordHash: await hashPassword(tempPassword),
              mustChangePassword: true,
            }),
          ]
        : []),
      db.insert(storeMembers).values({ userId, storeId, role: "owner" }),
      ...(v.starter ? [db.insert(categories).values(STARTER_CATEGORIES.map((name, i) => ({ storeId, name, sortOrder: i })))] : []),
    ])
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Endereço ou e-mail já cadastrado. Atualize a página e tente de novo." }
    throw e
  }

  revalidatePath("/admin/lojas")
  return {
    ok: true,
    message: existing
      ? `Loja "${v.storeName}" criada. ${existing.name} (${v.ownerEmail}) já tinha conta e foi vinculado(a) como dono: entra com a senha que já usa.`
      : `Loja "${v.storeName}" criada. Envie ao dono o endereço /admin, o e-mail ${v.ownerEmail} e a senha provisória abaixo (ele troca no primeiro acesso).`,
    secret: tempPassword ?? undefined,
  }
}

/** Entra no painel de uma loja (modo suporte) trocando a loja ativa da sessão. */
export async function enterStoreAction(storeId: string) {
  await requireSuperadmin()
  if (!uuidSchema.safeParse(storeId).success) return
  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).limit(1)
  if (!store) return
  await setActiveStore(store.id)
  redirect("/admin")
}

const reasonSchema = z.string().min(3, "Escreva o motivo (aparece para o dono da loja).").max(300, "Máximo 300 caracteres")

/** Suspende a loja: some do site, não aceita pedidos e o painel da equipe mostra o motivo. */
export async function suspendStoreAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSuperadmin()
  const storeId = formText(fd, "storeId")
  if (!uuidSchema.safeParse(storeId).success) return { error: "Loja inválida." }
  const reason = reasonSchema.safeParse(formText(fd, "reason"))
  if (!reason.success) return { fieldErrors: { reason: reason.error.issues[0].message } }

  await db
    .update(stores)
    .set({ active: false, suspendedReason: reason.data, suspendedAt: new Date() })
    .where(eq(stores.id, storeId))
  revalidatePath("/admin/lojas")
  revalidatePath("/loja", "layout")
  return { ok: true }
}

export async function reactivateStoreAction(storeId: string) {
  await requireSuperadmin()
  if (!uuidSchema.safeParse(storeId).success) return
  await db.update(stores).set({ active: true, suspendedReason: null, suspendedAt: null }).where(eq(stores.id, storeId))
  revalidatePath("/admin/lojas")
  revalidatePath("/loja", "layout")
}

/** Gera nova senha provisória para um usuário (ex.: dono esqueceu a senha) e desconecta os aparelhos dele. */
export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSuperadmin()
  const userId = formText(fd, "userId")
  if (!uuidSchema.safeParse(userId).success) return { error: "Usuário inválido." }
  if (userId === session.user.id) return { error: "Para a sua própria senha, use Minha conta." }

  const tempPassword = generateTempPassword()
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .where(eq(users.id, userId))
    .returning({ email: users.email })
  if (!updated) return { error: "Usuário não encontrado." }
  await db.delete(sessions).where(eq(sessions.userId, userId))

  return { ok: true, message: `Nova senha provisória de ${updated.email}:`, secret: tempPassword }
}
