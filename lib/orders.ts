import "server-only"

import { randomBytes } from "node:crypto"
import { cache } from "react"
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { categories, deliveryZones, ingredients, menuItemCategories, menuItems, orders, stores } from "@/db/schema"
import {
  formatBRL,
  orderInputSchema,
  type DeliveryConfig,
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
    coverUrl: s.coverUrl,
    primaryColor: s.primaryColor,
    phone: s.phone,
    address: s.address,
    isOpen: s.isOpen,
    avgPrepMinutes: s.avgPrepMinutes,
  }
}
export type PublicStore = ReturnType<typeof publicStore>

// ---------- Cardápio ----------
export interface MenuItemView {
  id: string
  categoryId: string | null
  /** Outras categorias em que o item também aparece ("Mais vendidos"…) */
  alsoIn: string[]
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
  categories: { id: string; name: string; extrasEnabled: boolean }[]
  items: MenuItemView[]
  /** Ordem dos itens que aparecem numa categoria além da principal: categoria → ids de item */
  extraOrder: Record<string, string[]>
  ingredients: IngredientView[]
}

export const getMenu = cache(async (storeId: string): Promise<MenuView> => {
  const [cats, items, ings, links] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, extrasEnabled: categories.extrasEnabled })
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
    db
      .select({ itemId: menuItemCategories.menuItemId, categoryId: menuItemCategories.categoryId })
      .from(menuItemCategories)
      .innerJoin(categories, eq(categories.id, menuItemCategories.categoryId))
      .where(eq(categories.storeId, storeId))
      .orderBy(asc(menuItemCategories.sortOrder)),
  ])
  const alsoIn = new Map<string, string[]>()
  const extraOrder: Record<string, string[]> = {}
  for (const l of links) {
    alsoIn.set(l.itemId, [...(alsoIn.get(l.itemId) ?? []), l.categoryId])
    ;(extraOrder[l.categoryId] ??= []).push(l.itemId)
  }

  return {
    categories: cats,
    extraOrder,
    items: items.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      alsoIn: (alsoIn.get(i.id) ?? []).filter((c) => c !== i.categoryId),
      name: i.name,
      description: i.description,
      price: Number(i.price),
      imageUrl: i.imageUrl,
      available: i.available,
    })),
    ingredients: ings.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), groupName: i.groupName })),
  }
})

// ---------- Entrega ----------
/** Regras de entrega da loja + bairros ativos (ordem alfabética). */
export const getDeliveryConfig = cache(async (store: StoreRow): Promise<DeliveryConfig> => {
  const zones =
    store.deliveryPricing === "zones"
      ? await db
          .select({ id: deliveryZones.id, name: deliveryZones.name, fee: deliveryZones.fee })
          .from(deliveryZones)
          .where(and(eq(deliveryZones.storeId, store.id), eq(deliveryZones.active, true)))
          .orderBy(asc(sql`lower(${deliveryZones.name})`))
      : []
  return {
    enabled: store.deliveryEnabled,
    pricing: store.deliveryPricing,
    fixedFee: Number(store.deliveryFixedFee),
    minOrder: Number(store.deliveryMinOrder),
    zones: zones.map((z) => ({ id: z.id, name: z.name, fee: Number(z.fee) })),
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
  DELIVERY_UNAVAILABLE: "Esta loja não está fazendo entregas no momento. Escolha retirada.",
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
        ${JSON.stringify(o.items)}::jsonb, ${token}, ${opts.requireOpen},
        ${o.type === "delivery" ? o.deliveryZoneId : null}::uuid
      ) as result`)
    const result = res.rows[0].result
    return { ok: true, orderNumber: result.orderNumber, publicToken: result.publicToken }
  } catch (err) {
    // O Drizzle embrulha o erro ("Failed query: …" + parâmetros); a mensagem do RAISE EXCEPTION fica em err.cause.
    // Usa só a mensagem do banco: a de fora contém dados digitados pelo cliente.
    const dbError = err instanceof Error && err.cause instanceof Error ? err.cause : err
    const msg = dbError instanceof Error ? dbError.message : ""
    const code = Object.keys(DB_ERRORS).find((c) => msg.includes(c))
    if (code) return { ok: false, error: DB_ERRORS[code] }
    if (msg.includes("ZONE_INVALID")) {
      const error = "Escolha um bairro atendido pela loja (a lista pode ter mudado)."
      return { ok: false, error, fieldErrors: { deliveryZoneId: error } }
    }
    const min = msg.match(/BELOW_MIN_ORDER:([\d.]+)/)
    if (min) return { ok: false, error: `O pedido mínimo para entrega é ${formatBRL(Number(min[1]))}. Adicione mais itens ou escolha retirada.` }
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
    deliveryZoneName: o.deliveryZoneName,
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
    customerConfirmedAt: o.customerConfirmedAt?.toISOString() ?? null,
    outForDeliveryAt: o.outForDeliveryAt?.toISOString() ?? null,
    autoDelivered: o.autoDelivered,
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
  const find = () =>
    db.query.orders.findFirst({
      where: eq(orders.publicToken, token),
      with: { ...withItems, store: true },
    })
  let row = await find()
  if (row?.status === "out_for_delivery") {
    await autoCompleteDeliveries(row.storeId)
    row = await find()
  }
  if (!row) return null
  return { order: toView(row), store: publicStore(row.store) }
}

/** Pedidos da loja, com filtros opcionais de período e status. */
/** Depois de quanto tempo "saiu para entrega" vira "entregue" sozinho (se ninguém confirmar). */
export const AUTO_DELIVER_MINUTES = 60

/**
 * Fecha as entregas que saíram há mais de AUTO_DELIVER_MINUTES e ninguém confirmou.
 * Roda ao ler pedidos (cozinha atualiza a cada 8s, cliente a cada 10s): não precisa de tarefa agendada.
 * Pedidos antigos sem `out_for_delivery_at` usam o horário do pedido.
 */
export async function autoCompleteDeliveries(storeId: string) {
  const since = sql`coalesce(${orders.outForDeliveryAt}, ${orders.createdAt})`
  await db
    .update(orders)
    .set({ status: "delivered", autoDelivered: true, completedAt: sql`${since} + make_interval(mins => ${AUTO_DELIVER_MINUTES})` })
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, "out_for_delivery"),
        sql`${since} < now() - make_interval(mins => ${AUTO_DELIVER_MINUTES})`,
      ),
    )
}

export async function listOrders(
  storeId: string,
  filter: { from?: Date; to?: Date; statuses?: OrderStatus[]; limit?: number } = {},
) {
  await autoCompleteDeliveries(storeId)
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
/**
 * Cliente confirma pelo link do pedido que recebeu a entrega.
 * Só vale para pedido de entrega que está "saiu para entrega" (o token público é a autorização).
 */
export async function confirmDeliveryByToken(token: string) {
  const now = new Date()
  const [row] = await db
    .update(orders)
    .set({ status: "delivered", completedAt: now, customerConfirmedAt: now })
    .where(and(eq(orders.publicToken, token), eq(orders.type, "delivery"), eq(orders.status, "out_for_delivery")))
    .returning({ id: orders.id })
  return !!row
}

export async function setOrderStatus(storeId: string, orderId: string, status: OrderStatus) {
  const done = status === "delivered" || status === "cancelled"
  const updated = await db
    .update(orders)
    .set({
      status,
      completedAt: done ? new Date() : null,
      autoDelivered: false,
      // marca quando saiu (conta a 1h do fechamento automático); voltar etapa limpa
      ...(status === "out_for_delivery" ? { outForDeliveryAt: new Date() } : done ? {} : { outForDeliveryAt: null }),
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.storeId, storeId),
        // "saiu para entrega" só existe para pedidos de entrega
        status === "out_for_delivery" ? eq(orders.type, "delivery") : undefined,
      ),
    )
    .returning({ id: orders.id })
  return updated.length > 0
}
