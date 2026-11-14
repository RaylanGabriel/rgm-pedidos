"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { ingredients, menuItemIngredients, menuItems, stockMovements } from "@/db/schema"
import { isOwner } from "@/lib/auth/session"
import { formText, type FormState } from "@/lib/form-state"
import { nameKey } from "@/lib/recipe"
import { STOCK_UNITS } from "@/lib/stock"
import { parseQty } from "@/lib/stock-format"

/*
 * Estoque (9b) — só o dono. Tudo filtrado pela loja da sessão.
 * O saldo (ingredients.stock) e o histórico (stock_movements) mudam juntos, num único comando SQL.
 */

const NO_PERMISSION: FormState = { error: "Só o dono da loja pode mexer no estoque." }
const uuid = z.string().uuid()

function refresh(slug: string) {
  revalidatePath("/admin/estoque")
  revalidatePath("/admin")
  revalidatePath(`/loja/${slug}`)
}

/** Passa a controlar um ingrediente (existente ou novo, como "Pão"), com unidade, mínimo e quanto 1 adicional gasta. */
export async function trackIngredientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const storeId = ctx.store.id
  const unit = formText(fd, "unit")
  if (!(STOCK_UNITS as readonly string[]).includes(unit)) return { error: "Escolha a unidade.", fieldErrors: { unit: "Escolha a unidade" } }
  const min = parseQty(formText(fd, "minStock"))
  if (min === undefined) return { error: "Mínimo inválido.", fieldErrors: { minStock: "Use um número, ex.: 10 ou 2,5" } }
  const extra = parseQty(formText(fd, "extraAmount"))
  if (extra === undefined || extra === 0) return { error: "Quantidade do adicional inválida.", fieldErrors: { extraAmount: "Use um número maior que zero" } }

  let id = formText(fd, "id")
  const newName = formText(fd, "newName").replace(/\s+/g, " ")
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Ingrediente inválido." }
  } else {
    if (newName.length < 2 || newName.length > 60) return { error: "Escolha um ingrediente ou digite o nome.", fieldErrors: { newName: "De 2 a 60 letras" } }
    // mesmo nome de um ingrediente que já existe: usa ele (não duplica "Pão"). Se houver o adicional e o base com o
    // mesmo nome (ex.: Bacon), fica o ADICIONAL: um contador só para a ficha e para o "+ bacon".
    const all = await db.select({ id: ingredients.id, name: ingredients.name, isExtra: ingredients.isExtra }).from(ingredients).where(eq(ingredients.storeId, storeId))
    const same = all.filter((b) => nameKey(b.name) === nameKey(newName)).sort((a, b) => Number(b.isExtra) - Number(a.isExtra))[0]
    if (same) id = same.id
    else {
      const [c] = await db
        .insert(ingredients)
        .values({ storeId, name: newName[0].toUpperCase() + newName.slice(1), price: "0", groupName: "Base", isExtra: false })
        .returning({ id: ingredients.id })
      id = c.id
    }
  }
  const updated = await db
    .update(ingredients)
    .set({ trackStock: true, unit, minStock: min === null ? null : String(min), extraAmount: String(extra ?? 1) })
    .where(and(eq(ingredients.id, id), eq(ingredients.storeId, storeId)))
    .returning({ id: ingredients.id })
  if (!updated.length) return { error: "Ingrediente não encontrado." }
  refresh(ctx.store.slug)
  return { ok: true, message: "Pronto. Agora lance a quantidade que você tem (Entrada) e informe quanto cada lanche gasta em Fichas." }
}

/** Para de controlar (o histórico fica; o saldo deixa de esgotar lanches). */
export async function untrackIngredientAction(id: string) {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  await db.update(ingredients).set({ trackStock: false }).where(and(eq(ingredients.id, id), eq(ingredients.storeId, ctx.store.id)))
  refresh(ctx.store.slug)
}

const KINDS = ["purchase", "loss", "adjust"] as const

/** Entrada (+), perda (−) ou ajuste pela contagem (o saldo passa a ser o que foi contado). */
export async function stockMovementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const id = formText(fd, "ingredientId")
  const kind = formText(fd, "kind") as (typeof KINDS)[number]
  const qty = parseQty(formText(fd, "amount"))
  const note = formText(fd, "note").slice(0, 200) || null
  if (!uuid.safeParse(id).success || !KINDS.includes(kind)) return { error: "Movimentação inválida." }
  if (qty === undefined || qty === null || (kind !== "adjust" && qty === 0)) return { error: "Quantidade inválida.", fieldErrors: { amount: "Use um número, ex.: 100 ou 2,5" } }
  const storeId = ctx.store.id
  const userId = ctx.user.id

  // Um comando só: muda o saldo e grava o histórico juntos (o ajuste grava a diferença entre o contado e o saldo)
  const res =
    kind === "adjust"
      ? await db.execute<{ id: string }>(sql`
          with old as (
            select id, stock from ${ingredients} where id = ${id} and store_id = ${storeId} and track_stock for update
          ), upd as (
            update ${ingredients} i set stock = ${qty} from old where i.id = old.id returning i.id
          )
          insert into ${stockMovements} (store_id, ingredient_id, delta, kind, note, user_id)
          select ${storeId}, old.id, ${qty} - old.stock, 'adjust', ${note}, ${userId} from old join upd on upd.id = old.id
          returning id`)
      : await db.execute<{ id: string }>(sql`
          with upd as (
            update ${ingredients} set stock = stock + ${kind === "purchase" ? qty : -qty}
             where id = ${id} and store_id = ${storeId} and track_stock
            returning id
          )
          insert into ${stockMovements} (store_id, ingredient_id, delta, kind, note, user_id)
          select ${storeId}, upd.id, ${kind === "purchase" ? qty : -qty}, ${kind}::stock_movement_kind, ${note}, ${userId} from upd
          returning id`)
  if (!res.rows.length) return { error: "Ingrediente não encontrado ou sem controle de estoque." }
  refresh(ctx.store.slug)
  return { ok: true, message: kind === "purchase" ? "Entrada lançada." : kind === "loss" ? "Perda lançada." : "Saldo ajustado." }
}

/**
 * Ficha de estoque de um lanche: quanto 1 unidade gasta de cada ingrediente controlado (campos q_<ingrediente>).
 * Só mexe na quantidade: os botões "sem ___" (removable) ficam como estão. Vazio ou 0 = não gasta.
 */
export async function saveRecipeQtyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const storeId = ctx.store.id
  const itemId = formText(fd, "itemId")
  if (!uuid.safeParse(itemId).success) return { error: "Lanche inválido." }
  const [item] = await db.select({ id: menuItems.id }).from(menuItems).where(and(eq(menuItems.id, itemId), eq(menuItems.storeId, storeId))).limit(1)
  if (!item) return { error: "Lanche não encontrado." }

  const tracked = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(eq(ingredients.storeId, storeId), eq(ingredients.trackStock, true)))
  const values: { ingredientId: string; qty: number | null }[] = []
  for (const { id } of tracked) {
    // × na tela: marca "não usa" (quantidade 0) — some da ficha mesmo se estiver na descrição ou for botão "sem ___"
    if (fd.has(`drop_${id}`)) {
      values.push({ ingredientId: id, qty: 0 })
      continue
    }
    if (!fd.has(`q_${id}`)) continue
    const q = parseQty(formText(fd, `q_${id}`))
    if (q === undefined) return { error: "Quantidade inválida.", fieldErrors: { [`q_${id}`]: "Use um número, ex.: 1 ou 0,15" } }
    values.push({ ingredientId: id, qty: q && q > 0 ? q : null })
  }
  if (!values.length) return { ok: true, message: "Nada para salvar." }

  const set = values.filter((v) => v.qty !== null) // inclui o 0 do ×
  const clear = values.filter((v) => v.qty === null).map((v) => v.ingredientId)
  // Uma transação: grava as quantidades, limpa as que saíram e apaga a linha que não é botão "sem ___" nem gasta nada
  const upserts = set.map((v) =>
    db
      .insert(menuItemIngredients)
      .values({ menuItemId: itemId, ingredientId: v.ingredientId, removable: false, quantity: String(v.qty) })
      .onConflictDoUpdate({ target: [menuItemIngredients.menuItemId, menuItemIngredients.ingredientId], set: { quantity: String(v.qty) } }),
  )
  const clears = clear.length
    ? [db.update(menuItemIngredients).set({ quantity: null }).where(and(eq(menuItemIngredients.menuItemId, itemId), inArray(menuItemIngredients.ingredientId, clear)))]
    : []
  const cleanup = db
    .delete(menuItemIngredients)
    .where(and(eq(menuItemIngredients.menuItemId, itemId), eq(menuItemIngredients.removable, false), isNull(menuItemIngredients.quantity)))
  await db.batch([...upserts, ...clears, cleanup] as unknown as Parameters<typeof db.batch>[0])
  refresh(ctx.store.slug)
  return { ok: true, message: "Ficha salva." }
}
