import "server-only"

import { and, asc, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "@/db"
import { ingredients, menuItemIngredients, menuItems, stockMovements, users } from "@/db/schema"
import { recordError } from "@/lib/alerts"

/*
 * Controle de estoque (9b). Regras no banco (drizzle/0030_estoque.sql):
 * - só ingredientes com track_stock; consumo = ficha do lanche × qtd, sem os "sem ___", + adicionais × extra_amount;
 * - apply_order_stock: desconta quando o pedido ENTRA NA COZINHA (uma vez só por pedido);
 * - return_order_stock: devolve, pelo histórico, quando um pedido que já descontou é cancelado;
 * - menu_item_out_of_stock: lanche sem saldo para 1 unidade fica esgotado (cardápio e create_order).
 * Daqui só se chama o banco; falhar aqui NUNCA derruba um pedido (o cron confere e completa depois).
 */

export const STOCK_UNITS = ["un", "fatia", "g", "kg", "ml", "L"] as const
export type StockUnit = (typeof STOCK_UNITS)[number]

/** Pedido entrou na cozinha: desconta o estoque. Idempotente; nunca lança erro. */
export async function applyOrderStock(orderId: string) {
  try {
    await db.execute(sql`select apply_order_stock(${orderId}::uuid)`)
  } catch (err) {
    await recordError("estoque", `aplicar/${orderId}`, err)
  }
}

/** Pedido que já tinha descontado foi cancelado: devolve. Idempotente; nunca lança erro. */
export async function returnOrderStock(orderId: string) {
  try {
    await db.execute(sql`select return_order_stock(${orderId}::uuid)`)
  } catch (err) {
    await recordError("estoque", `devolver/${orderId}`, err)
  }
}

/**
 * Conferência do cron: pedido que está (ou passou) pela cozinha e não descontou → desconta; cancelado que descontou e
 * não devolveu → devolve. Cobre qualquer chamada que tenha falhado no caminho. Devolve quantos pedidos acertou.
 */
export async function reconcileStock() {
  const pend = await db.execute<{ id: string }>(sql`
    select id from orders
     where stock_applied_at is null and status <> 'cancelled' and (mp_order_id is null or payment_status = 'paid')
     limit 200`)
  const back = await db.execute<{ id: string }>(sql`
    select id from orders
     where status = 'cancelled' and stock_applied_at is not null and stock_returned_at is null
     limit 200`)
  for (const { id } of pend.rows) await db.execute(sql`select apply_order_stock(${id}::uuid)`)
  for (const { id } of back.rows) await db.execute(sql`select return_order_stock(${id}::uuid)`)
  return pend.rows.length + back.rows.length
}

export type StockLevel = "ok" | "low" | "out"
export const stockLevel = (stock: number, min: number | null): StockLevel => (stock <= 0 ? "out" : min !== null && stock <= min ? "low" : "ok")

/** Ingredientes da loja, controlados primeiro (para a tela Estoque). */
export async function listStockIngredients(storeId: string) {
  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      isExtra: ingredients.isExtra,
      active: ingredients.active,
      trackStock: ingredients.trackStock,
      unit: ingredients.unit,
      stock: ingredients.stock,
      minStock: ingredients.minStock,
      extraAmount: ingredients.extraAmount,
    })
    .from(ingredients)
    .where(eq(ingredients.storeId, storeId))
    .orderBy(desc(ingredients.trackStock), asc(ingredients.name))
  return rows.map((r) => {
    const stock = Number(r.stock)
    const min = r.minStock === null ? null : Number(r.minStock)
    return { ...r, stock, minStock: min, extraAmount: Number(r.extraAmount), level: stockLevel(stock, min) }
  })
}

/** Quantos ingredientes controlados estão acabando / acabaram (card do início do painel). */
export async function stockAlerts(storeId: string) {
  const [row] = await db
    .select({
      out: sql<number>`count(*) filter (where ${ingredients.stock} <= 0)::int`,
      low: sql<number>`count(*) filter (where ${ingredients.stock} > 0 and ${ingredients.minStock} is not null and ${ingredients.stock} <= ${ingredients.minStock})::int`,
      tracked: sql<number>`count(*)::int`,
    })
    .from(ingredients)
    .where(and(eq(ingredients.storeId, storeId), eq(ingredients.trackStock, true), eq(ingredients.active, true)))
  return row ?? { out: 0, low: 0, tracked: 0 }
}

/** Fichas: cada lanche com a quantidade de cada ingrediente controlado (para a aba Fichas). */
export async function listRecipes(storeId: string) {
  const [items, rows] = await Promise.all([
    db
      .select({ id: menuItems.id, name: menuItems.name, active: menuItems.active })
      .from(menuItems)
      .where(eq(menuItems.storeId, storeId))
      .orderBy(desc(menuItems.active), asc(menuItems.name)),
    db
      .select({ itemId: menuItemIngredients.menuItemId, ingredientId: menuItemIngredients.ingredientId, quantity: menuItemIngredients.quantity })
      .from(menuItemIngredients)
      .innerJoin(menuItems, eq(menuItems.id, menuItemIngredients.menuItemId))
      .where(and(eq(menuItems.storeId, storeId), sql`${menuItemIngredients.quantity} > 0`)),
  ])
  const byItem = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const m = byItem.get(r.itemId) ?? {}
    m[r.ingredientId] = Number(r.quantity)
    byItem.set(r.itemId, m)
  }
  return items.map((i) => ({ ...i, quantities: byItem.get(i.id) ?? {} }))
}

export const MOVEMENT_LABEL = { order: "Pedido", order_return: "Pedido cancelado", purchase: "Entrada", loss: "Perda", adjust: "Ajuste" } as const

/** Últimas movimentações (aba Histórico). */
export async function listMovements(storeId: string, limit = 100) {
  const rows = await db.execute<{
    id: string
    created_at: string
    kind: keyof typeof MOVEMENT_LABEL
    delta: string
    note: string | null
    ingredient: string
    unit: string
    order_number: number | null
    user_name: string | null
  }>(sql`
    select m.id, m.created_at, m.kind, m.delta, m.note, i.name as ingredient, i.unit, o.order_number, u.name as user_name
      from ${stockMovements} m
      join ${ingredients} i on i.id = m.ingredient_id
      left join orders o on o.id = m.order_id
      left join ${users} u on u.id = m.user_id
     where m.store_id = ${storeId}
     order by m.created_at desc
     limit ${limit}`)
  return rows.rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at),
    kind: r.kind,
    delta: Number(r.delta),
    note: r.note,
    ingredient: r.ingredient,
    unit: r.unit,
    orderNumber: r.order_number,
    userName: r.user_name,
  }))
}

/**
 * Consumo no período (pedidos − devoluções) por ingrediente controlado e sugestão de compra:
 * consumo médio por dia × 7 dias + mínimo − saldo (nunca negativo).
 */
export async function stockConsumption(storeId: string, days: number) {
  const since = new Date(Date.now() - days * 86400_000)
  const [list, used] = await Promise.all([
    listStockIngredients(storeId),
    db
      .select({ ingredientId: stockMovements.ingredientId, used: sql<string>`-sum(${stockMovements.delta})` })
      .from(stockMovements)
      .where(and(eq(stockMovements.storeId, storeId), gte(stockMovements.createdAt, since), sql`${stockMovements.kind} in ('order', 'order_return')`))
      .groupBy(stockMovements.ingredientId),
  ])
  const usedBy = new Map(used.map((u) => [u.ingredientId, Number(u.used)]))
  return list
    .filter((i) => i.trackStock)
    .map((i) => {
      const consumed = Math.max(0, usedBy.get(i.id) ?? 0)
      const perDay = consumed / days
      const buy = Math.max(0, perDay * 7 + (i.minStock ?? 0) - i.stock)
      return { id: i.id, name: i.name, unit: i.unit, stock: i.stock, consumed, perDay, buy }
    })
}
