import "server-only"

import { randomBytes } from "node:crypto"
import { cache } from "react"
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { cancelOverduePix, createPixCharge, storeAccessToken, syncPixOrder } from "@/lib/mercadopago"
import { distanceTiers, quoteDistance, quoteError } from "@/lib/geo"
import { openStateLabel, parseHours, storeOpenState, weekSummary } from "@/lib/hours"
import { categories, deliveryZones, ingredients, menuItemCategories, menuItems, orders, stores } from "@/db/schema"
import {
  addressLine,
  formatBRL,
  formatKm,
  type StoreLocation,
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
export function publicStore(s: StoreRow, base = `/loja/${s.slug}`) {
  const now = new Date()
  const open = storeOpenState(s, now)
  const hours = s.hoursEnabled ? parseHours(s.openingHours) : null
  return {
    id: s.id,
    slug: s.slug,
    base, // links internos: "" no endereço da loja, "/loja/<slug>" nos outros (lib/site-url → storeBase)
    name: s.name,
    logoUrl: s.logoUrl,
    coverUrl: s.coverUrl,
    primaryColor: s.primaryColor,
    phone: s.phone,
    address: s.address,
    instagram: s.instagram,
    facebook: s.facebook,
    isOpen: open.open, // situação efetiva (horário automático ou botão manual)
    openLabel: openStateLabel(open, now), // "Fecha às 23:30" / "Abre amanhã às 18:00"
    weekHours: hours ? weekSummary(hours) : null,
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
  const tiers = store.deliveryPricing === "distance" ? await distanceTiers(store.id) : []
  const loc = store.location as StoreLocation | null
  return {
    enabled: store.deliveryEnabled,
    pricing: store.deliveryPricing,
    fixedFee: Number(store.deliveryFixedFee),
    minOrder: Number(store.deliveryMinOrder),
    zones: zones.map((z) => ({ id: z.id, name: z.name, fee: Number(z.fee) })),
    tiers,
    hasLocation: typeof loc?.lat === "number",
    city: loc?.city ?? "",
    state: loc?.state ?? "",
  }
})

// ---------- Criar pedido ----------
export type CreateOrderResult =
  | { ok: true; orderNumber: number; publicToken: string; pixQr?: boolean }
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
  opts: { requireOpen: boolean; pixOnline: boolean },
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

  // Entrega por km: o servidor localiza o endereço e calcula a distância (o banco escolhe a faixa e a taxa)
  let distanceKm: number | null = null
  let deliveryAddress = o.type === "delivery" ? o.deliveryAddress : null
  if (o.type === "delivery") {
    const [st] = await db.select({ id: stores.id, pricing: stores.deliveryPricing, location: stores.location }).from(stores).where(eq(stores.id, storeId)).limit(1)
    if (st?.pricing === "distance") {
      if (!o.addressParts) return { ok: false, error: "Informe o endereço de entrega.", fieldErrors: { street: "Informe a rua" } }
      const quote = await quoteDistance(st, o.addressParts)
      if (!quote.ok) return { ok: false, error: quoteError(quote), fieldErrors: { street: quoteError(quote) } }
      distanceKm = quote.km
      deliveryAddress = addressLine(o.addressParts)
    }
  }

  // Loja aberta? A regra (horário automático + ajuste manual) fica em lib/hours.ts; o banco só confere se existe/está ativa.
  if (opts.requireOpen) {
    const [st] = await db
      .select({ isOpen: stores.isOpen, hoursEnabled: stores.hoursEnabled, openingHours: stores.openingHours, manualUntil: stores.manualUntil })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1)
    if (st && !storeOpenState(st).open) return { ok: false, error: DB_ERRORS.STORE_CLOSED }
  }

  try {
    const res = await db.execute<{ result: { orderNumber: number; publicToken: string } }>(sql`
      select create_order(
        ${storeId}::uuid, ${o.customerName}, ${o.customerPhone}, ${o.type}::order_type,
        ${deliveryAddress}, ${o.paymentMethod}::payment_method, ${o.notes},
        ${JSON.stringify(o.items)}::jsonb, ${token}, false,
        ${o.type === "delivery" ? o.deliveryZoneId : null}::uuid, ${distanceKm}::numeric
      ) as result`)
    const result = res.rows[0].result
    // Troco: só em dinheiro e só se a nota cobre o total calculado pelo banco
    if (o.paymentMethod === "cash" && o.changeFor) {
      await db
        .update(orders)
        .set({ changeFor: o.changeFor.toFixed(2) })
        .where(and(eq(orders.publicToken, token), eq(orders.storeId, storeId), sql`${orders.total} < ${o.changeFor}`))
    }
    // Pix online (site, ou balcão com "mostrar QR"): só se a loja conectou o Mercado Pago.
    // Se falhar, o pedido segue como "Pix direto com a loja" (não perde a venda).
    const pixQr = o.paymentMethod === "pix" && opts.pixOnline ? await attachPixCharge(storeId, token) : false
    return { ok: true, orderNumber: result.orderNumber, publicToken: result.publicToken, pixQr }
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
    const range = msg.match(/OUT_OF_RANGE:([\d.]+)/)
    if (range) return { ok: false, error: `Esse endereço fica fora da área de entrega (até ${formatKm(Number(range[1]))}). Escolha retirada.` }
    if (msg.includes("DISTANCE_REQUIRED")) return { ok: false, error: "Informe o endereço de entrega completo." }
    const min = msg.match(/BELOW_MIN_ORDER:([\d.]+)/)
    if (min) return { ok: false, error: `O pedido mínimo para entrega é ${formatBRL(Number(min[1]))}. Adicione mais itens ou escolha retirada.` }
    const unavailable = msg.match(/ITEM_UNAVAILABLE:(.+)/)
    if (unavailable) return { ok: false, error: `"${unavailable[1].trim()}" acabou. Remova do carrinho para continuar.` }
    console.error("Erro ao criar pedido:", err)
    return { ok: false, error: "Não foi possível criar o pedido. Tente novamente." }
  }
}

/** Gera a cobrança Pix no Mercado Pago e guarda no pedido. true = QR gerado. */
async function attachPixCharge(storeId: string, publicToken: string): Promise<boolean> {
  try {
    const mpToken = await storeAccessToken(storeId)
    if (!mpToken) return false
    const row = await db.query.orders.findFirst({
      where: and(eq(orders.publicToken, publicToken), eq(orders.storeId, storeId)),
      columns: { id: true, orderNumber: true, total: true, deliveryFee: true, customerName: true },
      with: { ...withItems, store: { columns: { name: true } } },
    })
    if (!row) return false
    // Itens com os adicionais somados no preço unitário (o Mercado Pago confere: soma dos itens = total)
    const items = row.items.map((i) => ({
      title: i.nameSnapshot,
      description: i.extras.length ? `+ ${i.extras.map((x) => (x.quantity > 1 ? `${x.quantity}x ${x.nameSnapshot}` : x.nameSnapshot)).join(", ")}` : null,
      unitPrice: Number(i.unitPrice) + i.extras.reduce((s, x) => s + Number(x.unitPrice) * x.quantity, 0),
      quantity: i.quantity,
    }))
    const pix = await createPixCharge(mpToken, {
      id: row.id,
      orderNumber: row.orderNumber,
      total: Number(row.total),
      storeName: row.store.name,
      customerName: row.customerName,
      items,
      deliveryFee: Number(row.deliveryFee),
    })
    await db
      .update(orders)
      .set({ mpOrderId: pix.mpOrderId, pixCode: pix.pixCode, pixExpiresAt: pix.expiresAt })
      .where(eq(orders.id, row.id))
    return true
  } catch (err) {
    console.error("Pix: não foi possível gerar a cobrança no Mercado Pago:", err instanceof Error ? err.message : err)
    return false
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
    deliveryDistanceKm: o.deliveryDistanceKm === null ? null : Number(o.deliveryDistanceKm),
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.deliveryFee),
    total: Number(o.total),
    changeFor: o.changeFor === null ? null : Number(o.changeFor),
    estimatedWaitMinutes: o.estimatedWaitMinutes,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.completedAt?.toISOString() ?? null,
    customerConfirmedAt: o.customerConfirmedAt?.toISOString() ?? null,
    outForDeliveryAt: o.outForDeliveryAt?.toISOString() ?? null,
    autoDelivered: o.autoDelivered,
    pixCode: o.pixCode,
    pixExpiresAt: o.pixExpiresAt?.toISOString() ?? null,
    paidAt: o.paidAt?.toISOString() ?? null,
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
  // Pix aguardando: confere no Mercado Pago (a tela atualiza a cada poucos segundos; o webhook também confirma)
  if (row && row.mpOrderId && row.paymentStatus === "pending" && row.status === "pending") {
    try {
      const result = await syncPixOrder(row.id)
      if (result !== "pending") row = await find()
      else if (row.pixExpiresAt && row.pixExpiresAt.getTime() < Date.now() - 5 * 60_000) {
        await cancelOverduePix(row.storeId)
        row = await find()
      }
    } catch (err) {
      console.error("Pix: falha ao consultar o Mercado Pago:", err instanceof Error ? err.message : err)
    }
  }
  if (!row) return null
  return { order: toView(row), store: publicStore(row.store) }
}

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

/** Pedidos da loja, com filtros opcionais de período e status (mais recentes primeiro). */
export async function listOrders(
  storeId: string,
  filter: { from?: Date; to?: Date; statuses?: OrderStatus[]; limit?: number; offset?: number } = {},
) {
  await Promise.all([autoCompleteDeliveries(storeId), cancelOverduePix(storeId)])
  const rows = await db.query.orders.findMany({
    where: and(
      eq(orders.storeId, storeId),
      filter.from ? gte(orders.createdAt, filter.from) : undefined,
      filter.to ? lt(orders.createdAt, filter.to) : undefined,
      filter.statuses?.length ? inArray(orders.status, filter.statuses) : undefined,
    ),
    with: withItems,
    orderBy: [desc(orders.createdAt), desc(orders.orderNumber)],
    limit: filter.limit ?? 500,
    offset: filter.offset,
  })
  return rows.map(toView)
}

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

/** Muda o status de um pedido — sempre restrito à loja informada. */
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
      // marca quando ficou pronto (tempo de preparo nos relatórios); voltar para antes de "pronto" limpa
      ...(status === "ready" ? { readyAt: new Date() } : status === "pending" || status === "preparing" ? { readyAt: null } : {}),
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
