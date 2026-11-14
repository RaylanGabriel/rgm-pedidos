"use server"

import { revalidatePath } from "next/cache"
import { and, asc, count, eq, inArray, isNull, max, not, notInArray, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { categories, ingredients, menuItemCategories, menuItemIngredients, menuItems } from "@/db/schema"
import { isOwner, requireStore } from "@/lib/auth/session"
import { formText, optional, priceSchema, zodErrorState, type FormState } from "@/lib/form-state"
import { nameKey, pendingRemovable } from "@/lib/recipe"
import { deleteImage, fileFrom, uploadImage } from "@/lib/storage"

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
  let previous: { imageUrl: string | null } | undefined
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Item inválido." }
    ;[previous] = await db
      .select({ imageUrl: menuItems.imageUrl })
      .from(menuItems)
      .where(and(eq(menuItems.id, id), eq(menuItems.storeId, store.id)))
    if (!previous) return { error: "Item não encontrado." }
  }

  // Foto: nova (substitui), removida, ou mantém a atual
  const file = fileFrom(fd, "image")
  let imageUrl: string | null | undefined
  if (file) {
    const up = await uploadImage(file, `stores/${store.id}/items`)
    if ("error" in up) return { fieldErrors: { image: up.error }, error: up.error }
    imageUrl = up.url
  } else if (fd.get("removeImage") === "on") imageUrl = null

  // "Também mostrar em": só categorias desta loja, sem repetir a principal
  const wanted = [...new Set(fd.getAll("alsoIn").map(String))].filter((c) => uuid.safeParse(c).success && c !== data.categoryId).slice(0, 30)
  const alsoIn = wanted.length
    ? (await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.storeId, store.id), inArray(categories.id, wanted)))).map((c) => c.id)
    : []

  const values = imageUrl === undefined ? data : { ...data, imageUrl }
  let itemId = id
  try {
    if (id) {
      await db
        .update(menuItems)
        .set(values)
        .where(and(eq(menuItems.id, id), eq(menuItems.storeId, store.id)))
    } else {
      const [{ n }] = await db
        .select({ n: count() })
        .from(menuItems)
        .where(and(eq(menuItems.storeId, store.id), data.categoryId ? eq(menuItems.categoryId, data.categoryId) : isNull(menuItems.categoryId)))
      ;[{ id: itemId }] = await db
        .insert(menuItems)
        .values({ ...values, storeId: store.id, sortOrder: n })
        .returning({ id: menuItems.id })
    }
    // Categorias extras do item (o item já foi conferido como desta loja):
    // as que continuam mantêm a posição; as novas entram no fim da lista daquela categoria
    const current = await db
      .select({ categoryId: menuItemCategories.categoryId })
      .from(menuItemCategories)
      .where(eq(menuItemCategories.menuItemId, itemId))
    const removed = current.map((c) => c.categoryId).filter((c) => !alsoIn.includes(c))
    const added = alsoIn.filter((c) => !current.some((x) => x.categoryId === c))
    const last = added.length
      ? await db
          .select({ categoryId: menuItemCategories.categoryId, max: max(menuItemCategories.sortOrder) })
          .from(menuItemCategories)
          .where(inArray(menuItemCategories.categoryId, added))
          .groupBy(menuItemCategories.categoryId)
      : []
    await runBatch([
      ...(removed.length
        ? [db.delete(menuItemCategories).where(and(eq(menuItemCategories.menuItemId, itemId), inArray(menuItemCategories.categoryId, removed)))]
        : []),
      ...added.map((categoryId) =>
        db.insert(menuItemCategories).values({
          menuItemId: itemId,
          categoryId,
          sortOrder: (last.find((l) => l.categoryId === categoryId)?.max ?? -1) + 1,
        }),
      ),
    ])
    await saveRecipe(store.id, itemId, fd)
  } catch (e) {
    if (imageUrl) await deleteImage(imageUrl) // não deixa foto órfã
    throw e
  }
  if (imageUrl !== undefined && previous?.imageUrl) await deleteImage(previous.imageUrl)

  refresh(store.slug)
  return { ok: true, message: id ? "Item atualizado." : "Item adicionado." }
}

/**
 * Botões "sem ___" do lanche (o item já foi conferido como desta loja). O formulário manda `removable`: os nomes,
 * tirados da descrição, que o cliente pode tirar. Formulário sem a seção (página antiga aberta): não mexe.
 */
async function saveRecipe(storeId: string, itemId: string, fd: FormData) {
  if (!fd.has("recipeForm")) return
  const names = fd.getAll("removable").map((v) => String(v).replace(/\s+/g, " ").trim()).filter((n) => n.length >= 2 && n.length <= 60)
  await setRemovable(storeId, itemId, names)
}

/**
 * Grava os botões "sem ___" de um lanche. Cada nome vira o ingrediente **base** da loja de mesmo nome (sem
 * diferenciar maiúsculas), criado se faltar. Nunca usa um adicional: para não querer um adicional, é só não escolher.
 * Só mexe na marca "pode tirar": a quantidade de estoque da ficha (9b) e os ingredientes fixos (pão, carne) ficam.
 */
async function setRemovable(storeId: string, itemId: string, rawNames: string[]) {
  const names = [...new Map(rawNames.map((n) => [nameKey(n), n])).values()].slice(0, 30)
  const base = await db
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(and(eq(ingredients.storeId, storeId), eq(ingredients.isExtra, false)))
  const byName = new Map(base.map((i) => [nameKey(i.name), i.id]))

  const toCreate = names.filter((n) => !byName.has(nameKey(n)))
  if (toCreate.length) {
    const created = await db
      .insert(ingredients)
      .values(toCreate.map((name) => ({ storeId, name: name[0].toUpperCase() + name.slice(1), price: "0", groupName: "Base", isExtra: false })))
      .returning({ id: ingredients.id, name: ingredients.name })
    for (const c of created) byName.set(nameKey(c.name), c.id)
  }
  const wanted = [...new Set(names.map((n) => byName.get(nameKey(n))!))]

  const notWanted = wanted.length ? notInArray(menuItemIngredients.ingredientId, wanted) : undefined
  await runBatch([
    // o que saiu da lista deixa de ser "pode tirar"…
    db.update(menuItemIngredients).set({ removable: false }).where(and(eq(menuItemIngredients.menuItemId, itemId), notWanted)),
    // …e some da ficha se não tiver quantidade de estoque
    db
      .delete(menuItemIngredients)
      .where(
        and(
          eq(menuItemIngredients.menuItemId, itemId),
          eq(menuItemIngredients.removable, false),
          or(isNull(menuItemIngredients.quantity), sql`${menuItemIngredients.quantity} <= 0`),
        ),
      ),
    ...wanted.map((ingredientId, sortOrder) =>
      db
        .insert(menuItemIngredients)
        .values({ menuItemId: itemId, ingredientId, removable: true, sortOrder })
        .onConflictDoUpdate({ target: [menuItemIngredients.menuItemId, menuItemIngredients.ingredientId], set: { removable: true, sortOrder } }),
    ),
  ])
}

/**
 * "Preencher pela descrição": lanches de categorias com adicionais que ainda não têm botões "sem ___" recebem a
 * sugestão (ingredientes curtos, sem medida). O dono confere cada um em "Editar".
 */
export async function fillRemovableAction() {
  const ctx = await isOwner()
  if (!ctx) return
  const storeId = ctx.store.id
  const [items, cats, done] = await Promise.all([
    db
      .select({ id: menuItems.id, name: menuItems.name, description: menuItems.description, categoryId: menuItems.categoryId })
      .from(menuItems)
      .where(eq(menuItems.storeId, storeId)),
    db.select({ id: categories.id, extrasEnabled: categories.extrasEnabled }).from(categories).where(eq(categories.storeId, storeId)),
    db
      .selectDistinct({ itemId: menuItemIngredients.menuItemId })
      .from(menuItemIngredients)
      .innerJoin(menuItems, eq(menuItems.id, menuItemIngredients.menuItemId))
      .where(and(eq(menuItems.storeId, storeId), eq(menuItemIngredients.removable, true))),
  ])
  for (const item of pendingRemovable(items, cats, done.map((d) => d.itemId))) {
    await setRemovable(storeId, item.id, item.names)
  }
  refresh(ctx.store.slug)
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
  const [gone] = await db
    .delete(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.storeId, ctx.store.id)))
    .returning({ imageUrl: menuItems.imageUrl })
  await deleteImage(gone?.imageUrl)
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

/** Sobe/desce um item entre os "também mostrados" numa categoria (ex.: ordem em "Mais pedidos"). */
export async function moveExtraItemAction(categoryId: string, itemId: string, direction: "up" | "down") {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(categoryId).success || !uuid.safeParse(itemId).success) return
  const rows = await db
    .select({ itemId: menuItemCategories.menuItemId })
    .from(menuItemCategories)
    .innerJoin(categories, eq(categories.id, menuItemCategories.categoryId))
    .where(and(eq(menuItemCategories.categoryId, categoryId), eq(categories.storeId, ctx.store.id)))
    .orderBy(asc(menuItemCategories.sortOrder))
  const ids = swapped(
    rows.map((r) => r.itemId),
    itemId,
    direction,
  )
  if (!ids) return
  await runBatch(
    ids.map((id, i) =>
      db
        .update(menuItemCategories)
        .set({ sortOrder: i })
        .where(and(eq(menuItemCategories.categoryId, categoryId), eq(menuItemCategories.menuItemId, id))),
    ),
  )
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
const categorySchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(40, "Nome muito longo"),
  extrasEnabled: z.boolean(),
})

export async function saveCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const parsed = categorySchema.safeParse({ name: formText(fd, "name"), extrasEnabled: fd.get("extrasEnabled") === "on" })
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
  return { ok: true, message: id ? "Categoria salva." : "Categoria criada." }
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

// ---------- Ingredientes (ficha técnica e adicionais) ----------
const ingredientSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  price: priceSchema,
  groupName: z.string().min(2, "Grupo muito curto").max(40, "Grupo muito longo"),
  isExtra: z.boolean(),
  active: z.boolean(),
})

export async function saveIngredientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const isExtra = fd.get("isExtra") === "on"
  const parsed = ingredientSchema.safeParse({
    name: formText(fd, "name"),
    // Só o adicional tem preço; ingrediente só da ficha fica com 0
    price: isExtra ? formText(fd, "price") : "0",
    groupName: formText(fd, "groupName") || (isExtra ? "Adicionais" : "Base"),
    isExtra,
    active: fd.get("active") === "on",
  })
  if (!parsed.success) return zodErrorState(parsed.error)

  const id = formText(fd, "id")
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Ingrediente inválido." }
    await db
      .update(ingredients)
      .set(parsed.data)
      .where(and(eq(ingredients.id, id), eq(ingredients.storeId, ctx.store.id)))
  } else {
    await db.insert(ingredients).values({ ...parsed.data, storeId: ctx.store.id })
  }
  refresh(ctx.store.slug)
  return { ok: true, message: id ? "Ingrediente atualizado." : "Ingrediente criado." }
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
