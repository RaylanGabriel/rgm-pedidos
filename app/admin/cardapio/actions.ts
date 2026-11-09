"use server"

import { revalidatePath } from "next/cache"
import { and, asc, count, eq, isNull, not } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { categories, ingredients, menuItems } from "@/db/schema"
import { isOwner, requireStore } from "@/lib/auth/session"
import { formText, optional, priceSchema, zodErrorState, type FormState } from "@/lib/form-state"

/*
 * Edição do cardápio. Regras:
 * - Tudo é filtrado por store_id da sessão (nunca confia em ids vindos do formulário sozinhos).
 * - Funcionário (staff) só pode marcar item como esgotado/disponível; o resto é do dono.
 */

const NO_PERMISSION: FormState = { error: "Só o dono da loja pode alterar o cardápio." }
const uuid = z.string().uuid()

function refresh(slug: string) {
  revalidatePath("/admin/cardapio")
  revalidatePath(`/loja/${slug}`)
}

// ---------- Itens ----------
const itemSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(80, "Nome muito longo"),
  description: optional(z.string().max(300, "Descrição muito longa")),
  price: priceSchema,
  categoryId: optional(uuid),
  active: z.boolean(),
})

export async function saveItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const { store } = ctx

  const parsed = itemSchema.safeParse({
    name: formText(fd, "name"),
    description: formText(fd, "description"),
    price: formText(fd, "price"),
    categoryId: formText(fd, "categoryId"),
    active: fd.get("active") === "on",
  })
  if (!parsed.success) return zodErrorState(parsed.error)
  const data = parsed.data

  // A categoria precisa ser desta loja
  if (data.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, data.categoryId), eq(categories.storeId, store.id)))
    if (!cat) return { error: "Categoria inválida." }
  }

  const id = formText(fd, "id")
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Item inválido." }
    const updated = await db
      .update(menuItems)
      .set(data)
      .where(and(eq(menuItems.id, id), eq(menuItems.storeId, store.id)))
      .returning({ id: menuItems.id })
    if (!updated.length) return { error: "Item não encontrado." }
  } else {
    const [{ n }] = await db
      .select({ n: count() })
      .from(menuItems)
      .where(and(eq(menuItems.storeId, store.id), data.categoryId ? eq(menuItems.categoryId, data.categoryId) : isNull(menuItems.categoryId)))
    await db.insert(menuItems).values({ ...data, storeId: store.id, sortOrder: n })
  }

  refresh(store.slug)
  return { ok: true, message: id ? "Item atualizado." : "Item adicionado." }
}

/** Esgotado/disponível — liberado também para funcionários. */
export async function toggleAvailableAction(id: string) {
  const { store } = await requireStore()
  if (!uuid.safeParse(id).success) return
  await db
    .update(menuItems)
    .set({ available: not(menuItems.available) })
    .where(and(eq(menuItems.id, id), eq(menuItems.storeId, store.id)))
  refresh(store.slug)
}

export async function deleteItemAction(id: string) {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  // Pedidos antigos guardam nome/preço próprios, então apagar não altera o histórico
  await db.delete(menuItems).where(and(eq(menuItems.id, id), eq(menuItems.storeId, ctx.store.id)))
  refresh(ctx.store.slug)
}

/** Sobe/desce um item dentro da categoria dele. */
export async function moveItemAction(id: string, direction: "up" | "down") {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  const [item] = await db
    .select({ categoryId: menuItems.categoryId })
    .from(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.storeId, ctx.store.id)))
  if (!item) return

  const siblings = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.storeId, ctx.store.id), item.categoryId ? eq(menuItems.categoryId, item.categoryId) : isNull(menuItems.categoryId)))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name))

  const ids = swapped(siblings.map((s) => s.id), id, direction)
  if (!ids) return
  await runBatch(ids.map((sid, i) => db.update(menuItems).set({ sortOrder: i }).where(eq(menuItems.id, sid))))
  refresh(ctx.store.slug)
}

/** Executa várias atualizações numa única transação (db.batch exige ao menos uma). */
async function runBatch<T extends Parameters<typeof db.batch>[0][number]>(queries: T[]) {
  const [first, ...rest] = queries
  if (first) await db.batch([first, ...rest])
}

function swapped(ids: string[], id: string, direction: "up" | "down") {
  const i = ids.indexOf(id)
  const j = direction === "up" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= ids.length) return null
  const next = [...ids]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// ---------- Categorias ----------
const categorySchema = z.object({ name: z.string().min(2, "Nome muito curto").max(40, "Nome muito longo") })

export async function saveCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const parsed = categorySchema.safeParse({ name: formText(fd, "name") })
  if (!parsed.success) return zodErrorState(parsed.error)

  const id = formText(fd, "id")
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Categoria inválida." }
    await db
      .update(categories)
      .set(parsed.data)
      .where(and(eq(categories.id, id), eq(categories.storeId, ctx.store.id)))
  } else {
    const [{ n }] = await db.select({ n: count() }).from(categories).where(eq(categories.storeId, ctx.store.id))
    await db.insert(categories).values({ ...parsed.data, storeId: ctx.store.id, sortOrder: n })
  }
  refresh(ctx.store.slug)
  return { ok: true, message: id ? "Categoria renomeada." : "Categoria criada." }
}

export async function deleteCategoryAction(id: string) {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  // Os itens da categoria não são apagados: ficam "sem categoria"
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.storeId, ctx.store.id)))
  refresh(ctx.store.slug)
}

export async function moveCategoryAction(id: string, direction: "up" | "down") {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  const all = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.storeId, ctx.store.id))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
  const ids = swapped(all.map((c) => c.id), id, direction)
  if (!ids) return
  await runBatch(ids.map((cid, i) => db.update(categories).set({ sortOrder: i }).where(eq(categories.id, cid))))
  refresh(ctx.store.slug)
}

// ---------- Adicionais ----------
const ingredientSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  price: priceSchema,
  groupName: z.string().min(2, "Grupo muito curto").max(40, "Grupo muito longo"),
  active: z.boolean(),
})

export async function saveIngredientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const parsed = ingredientSchema.safeParse({
    name: formText(fd, "name"),
    price: formText(fd, "price"),
    groupName: formText(fd, "groupName") || "Adicionais",
    active: fd.get("active") === "on",
  })
  if (!parsed.success) return zodErrorState(parsed.error)

  const id = formText(fd, "id")
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Adicional inválido." }
    await db
      .update(ingredients)
      .set(parsed.data)
      .where(and(eq(ingredients.id, id), eq(ingredients.storeId, ctx.store.id)))
  } else {
    await db.insert(ingredients).values({ ...parsed.data, storeId: ctx.store.id })
  }
  refresh(ctx.store.slug)
  return { ok: true, message: id ? "Adicional atualizado." : "Adicional criado." }
}

export async function toggleIngredientAction(id: string) {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  await db
    .update(ingredients)
    .set({ active: not(ingredients.active) })
    .where(and(eq(ingredients.id, id), eq(ingredients.storeId, ctx.store.id)))
  refresh(ctx.store.slug)
}

export async function deleteIngredientAction(id: string) {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  await db.delete(ingredients).where(and(eq(ingredients.id, id), eq(ingredients.storeId, ctx.store.id)))
  refresh(ctx.store.slug)
}
