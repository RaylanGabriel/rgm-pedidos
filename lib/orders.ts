import "server-only"

import { randomBytes } from "node:crypto"
import { cache } from "react"
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { categories, ingredients, menuItems, orders, stores } from "@/db/schema"
import {
  orderInputSchema,
  type OrderInput,
  type OrderStatus,
  type OrderWithItemsView,
} from "@/lib/order-shared"

// ---------- Loja ----------
export type StoreRow = typeof stores.$inferSelect

/** Loja ativa pelo slug (null se não existir ou estiver suspensa). */
export const getStoreBySlug = cache(async (slug: string) => {
  const [store] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.slug, slug), eq(stores.active, true)))
    .limit(1)
  return store ?? null
})

/** Nome de uma loja suspensa (para mostrar "indisponível" em vez de 404). O motivo nunca é público. */
export async function getSuspendedStoreName(slug: string) {
  const [store] = await db
    .select({ name: stores.name })
    .from(stores)
    .where(and(eq(stores.slug, slug), eq(stores.active, false)))
    .limit(1)
  return store?.name ?? null
}

/** Dados públicos da loja (sem contador interno etc.) para mandar ao navegador. */
export function publicStore(s: StoreRow) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    logoUrl: s.logoUrl,
    primaryColor: s.primaryColor,
    phone: s.phone,
    isOpen: s.isOpen,
    avgPrepMinutes: s.avgPrepMinutes,
  }
}
export type PublicStore = ReturnType<typeof publicStore>

// ---------- Cardápio ----------
export interface MenuItemView {
  id: string
  categoryId: string | null
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  available: boolean
}
export interface IngredientView {
  id: string
  name: string
  price: number
  groupName: string
}
export interface MenuView {
  categories: { id: string; name: string }[]
  items: MenuItemView[]
  ingredients: IngredientView[]
}

export const getMenu = cache(async (storeId: string): Promise<MenuView> => {
  const [cats, items, ings] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.storeId, storeId))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.storeId, storeId), eq(menuItems.active, true)))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.name)),
    db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.storeId, storeId), eq(ingredients.active, true)))
      .orderBy(asc(ingredients.groupName), asc(ingredients.name)),
  ])

  return {
    categories: cats,
    items: items.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      name: i.name,
      description: i.description,
      price: Number(i.price),
      imageUrl: i.imageUrl,
      available: i.available,
    })),
    ingredients: ings.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), groupName: i.groupName })),
  }
})

// ---------- Criar pedido ----------
export type CreateOrderResult =
  | { ok: true; orderNumber: number; publicToken: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string | undefined> }

const DB_ERRORS: Record<string, string> = {
  STORE_NOT_FOUND: "Loja não encontrada.",
  STORE_CLOSED: "A loja está fechada no momento e não está recebendo pedidos.",
  INVALID_ITEMS: "Seu carrinho tem itens inválidos. Atualize a página e monte o pedido de novo.",
  EXTRA_UNAVAILABLE: "Um dos adicionais escolhidos não está mais disponível. Revise seu carrinho.",
}

/**
 * Cria o pedido chamando a função create_order() do Postgres, que busca os preços no banco
 * e grava tudo numa única transação. O total enviado pelo navegador é ignorado.
 */
export async function createOrder(
  storeId: string,
  rawInput: unknown,
  opts: { requireOpen: boolean },
): Promise<CreateOrderResult> {
  const parsed = orderInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors
    return {
      ok: false,
      error: f.items?.[0] ?? "Verifique os campos destacados.",
      fieldErrors: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.[0]])),
    }
  }
  const o = parsed.data
  const token = randomBytes(18).toString("base64url")

  try {
    const res = await db.execute<{ result: { orderNumber: number; publicToken: string } }>(sql`
      select create_order(
        ${storeId}::uuid, ${o.customerName}, ${o.customerPhone}, ${o.type}::order_type,
        ${o.type === "delivery" ? o.deliveryAddress : null}, ${o.paymentMethod}::payment_method, ${o.notes},
        ${JSON.stringify(o.items)}::jsonb, ${token}, ${opts.requireOpen}
      ) as result`)
    const result = res.rows[0].result
    return { ok: true, orderNumber: result.orderNumber, publicToken: result.publicToken }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    const code = Object.keys(DB_ERRORS).find((c) => msg.includes(c))
    if (code) return { ok: false, error: DB_ERRORS[code] }
    const unavailable = msg.match(/ITEM_UNAVAILABLE:(.+)/)
    if (unavailable) return { ok: false, error: `"${unavailable[1].trim()}" acabou. Remova do carrinho para continuar.` }
    console.error("Erro ao criar pedido:", err)
    return { ok: false, error: "Não foi possível criar o pedido. Tente novamente." }
  }
}

export type { OrderInput }

// ---------- Ler pedidos ----------
type OrderRowWithItems = typeof orders.$inferSelect & {
  items: {
    id: string
    nameSnapshot: string
    unitPrice: string
    quantity: number
    extras: { id: string; nameSnapshot: string; unitPrice: string; quantity: number }[]
  }[]
}

function toView(o: OrderRowWithItems): OrderWithItemsView {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    publicToken: o.publicToken,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    type: o.type,
    deliveryAddress: o.deliveryAddress,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.deliveryFee),
    total: Number(o.total),
    estimatedWaitMinutes: o.estimatedWaitMinutes,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.completedAt?.toISOString() ?? null,
    items: o.items.map((i) => ({
      id: i.id,
      name: i.nameSnapshot,
      unitPrice: Number(i.unitPrice),
      quantity: i.quantity,
      extras: i.extras.map((e) => ({ id: e.id, name: e.nameSnapshot, unitPrice: Number(e.unitPrice), quantity: e.quantity })),
    })),
  }
}

const withItems = {
  items: {
    columns: { id: true, nameSnapshot: true, unitPrice: true, quantity: true },
    with: { extras: { columns: { id: true, nameSnapshot: true, unitPrice: true, quantity: true } } },
  },
} as const

/** Pedido pelo token público (link de acompanhamento do cliente). */
export async function getOrderByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const row = await db.query.orders.findFirst({
    where: eq(orders.publicToken, token),
    with: { ...withItems, store: true },
  })
  if (!row) return null
  return { order: toView(row), store: publicStore(row.store) }
}

/** Pedidos da loja, com filtros opcionais de período e status. */
export async function listOrders(
  storeId: string,
  filter: { from?: Date; to?: Date; statuses?: OrderStatus[]; limit?: number } = {},
) {
  const rows = await db.query.orders.findMany({
    where: and(
      eq(orders.storeId, storeId),
      filter.from ? gte(orders.createdAt, filter.from) : undefined,
      filter.to ? lt(orders.createdAt, filter.to) : undefined,
      filter.statuses?.length ? inArray(orders.status, filter.statuses) : undefined,
    ),
    with: withItems,
    orderBy: desc(orders.createdAt),
    limit: filter.limit ?? 500,
  })
  return rows.map(toView)
}

/** Muda o status de um pedido — sempre restrito à loja informada. */
export async function setOrderStatus(storeId: string, orderId: string, status: OrderStatus) {
  const done = status === "delivered" || status === "cancelled"
  const updated = await db
    .update(orders)
    .set({ status, completedAt: done ? new Date() : null })
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .returning({ id: orders.id })
  return updated.length > 0
}
