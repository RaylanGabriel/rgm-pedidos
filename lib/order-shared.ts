/**
 * Tipos e utilitários de pedido que podem rodar no navegador e no servidor.
 * (As consultas ao banco ficam em lib/orders.ts, só no servidor.)
 */
import { z } from "zod"
import { sanitizeString } from "@/lib/validations"

export type OrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled"
export type OrderType = "pickup" | "delivery" | "dine_in"
export type PaymentMethod = "pix" | "cash" | "card_on_delivery"

export interface OrderExtraView {
  id: string
  name: string
  unitPrice: number
  quantity: number // por lanche
}

export interface OrderItemView {
  id: string
  name: string
  unitPrice: number
  quantity: number
  extras: OrderExtraView[]
  /** Ingredientes que o cliente pediu para tirar ("SEM cebola"). Não mexem no preço. */
  removals: string[]
}

/** "SEM cebola, pimentão" (ou null). Um texto só para cozinha, impressão, acompanhamento, planilha e carrinho. */
export const removalsText = (removals: readonly string[]) => (removals.length ? `SEM ${removals.map((r) => r.toLowerCase()).join(", ")}` : null)

export interface OrderView {
  id: string
  orderNumber: number
  publicToken: string
  customerName: string
  customerPhone: string | null
  type: OrderType
  deliveryAddress: string | null
  deliveryDistanceKm: number | null
  deliveryZoneName: string | null
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: "pending" | "paid" | "refunded"
  subtotal: number
  deliveryFee: number
  total: number
  /** Dinheiro: cliente vai pagar com esta nota (troco = changeFor − total) */
  changeFor: number | null
  estimatedWaitMinutes: number
  notes: string | null
  createdAt: string
  completedAt: string | null
  /** Cliente confirmou o recebimento pelo celular */
  customerConfirmedAt: string | null
  outForDeliveryAt: string | null
  /** Fechado sozinho 1h depois de sair para entrega */
  autoDelivered: boolean
  /** Pix online (Mercado Pago): copia e cola, validade e quando foi pago */
  pixCode: string | null
  pixExpiresAt: string | null
  paidAt: string | null
}

/** Pedido com Pix online ainda não pago: não entra na fila da cozinha. */
export const awaitingPix = (o: Pick<OrderView, "pixCode" | "paymentStatus" | "status">) =>
  !!o.pixCode && o.paymentStatus === "pending" && o.status === "pending"

export type OrderWithItemsView = OrderView & { items: OrderItemView[] }

// ---------- Textos ----------
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Recebido",
  preparing: "Preparando",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
}

/**
 * Etapas do pedido — a MESMA sequência para a cozinha e para o cliente.
 * Entrega tem a etapa "saiu para entrega" entre "pronto" (aguardando o entregador) e "entregue".
 */
export function orderSteps(type: OrderType): OrderStatus[] {
  return type === "delivery"
    ? ["pending", "preparing", "ready", "out_for_delivery", "delivered"]
    : ["pending", "preparing", "ready", "delivered"]
}

/** Próxima etapa (null = fim ou cancelado). */
export function nextStatus(status: OrderStatus, type: OrderType): OrderStatus | null {
  const steps = orderSteps(type)
  const i = steps.indexOf(status)
  return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null
}

/** Etapa anterior, para desfazer um toque errado (só antes de finalizar). */
export function prevStatus(status: OrderStatus, type: OrderType): OrderStatus | null {
  const steps = orderSteps(type)
  const i = steps.indexOf(status)
  return i > 0 && status !== "delivered" ? steps[i - 1] : null
}

/** Pedido ainda em andamento (aparece no quadro da cozinha). */
export const ACTIVE_STATUSES: OrderStatus[] = ["pending", "preparing", "ready", "out_for_delivery"]

export const TYPE_LABEL: Record<OrderType, string> = {
  pickup: "Retirada",
  delivery: "Entrega",
  dine_in: "Comer no local",
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card_on_delivery: "Cartão na entrega/retirada",
}

// ---------- Dinheiro ----------
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const formatBRL = (value: number) => brl.format(value)

/** Total de uma linha: (preço do lanche + extras de cada lanche) × quantidade. */
export function lineTotal(item: { unitPrice: number; quantity: number; extras: { unitPrice: number; quantity: number }[] }) {
  const each = item.unitPrice + item.extras.reduce((s, e) => s + e.unitPrice * e.quantity, 0)
  return Math.round(each * item.quantity * 100) / 100
}

/** "50" / "50,00" / "R$ 1.000,50" → 50 / 1000.5 (vazio ou inválido = null). */
export function parseMoneyBR(v: string | null | undefined): number | null {
  const clean = (v ?? "").replace(/[^\d,.]/g, "")
  if (!clean) return null
  const n = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Texto do troco para cozinha, impressão e cliente ("Troco para R$ 50,00 (levar R$ 12,00)"). */
export function changeText(o: { paymentMethod: PaymentMethod; changeFor: number | null; total: number }) {
  if (o.paymentMethod !== "cash" || !o.changeFor) return null
  const back = Math.round((o.changeFor - o.total) * 100) / 100
  return back > 0 ? `Troco para ${formatBRL(o.changeFor)} (levar ${formatBRL(back)})` : null
}

// ---------- Campos do cliente ----------
/**
 * Telefone enquanto digita: só números, no formato (42) 99999-9999 (celular) ou (42) 3333-4444 (fixo).
 * Aceita colar "+55 42 99999-9999" (tira o 55 do país).
 */
export function maskPhone(v: string) {
  let d = v.replace(/\D/g, "")
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  const split = rest[0] === "9" ? 5 : 4 // celular (começa com 9) tem 9 dígitos; fixo tem 8
  if (rest.length <= split) return `(${ddd}) ${rest}` // sem traço sobrando: apagar funciona normal
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
}

/** Nome: só letras (com acento), espaço, apóstrofo, hífen e ponto — ex.: "Ana-Maria D'Ávila Jr." */
export const NAME_ALLOWED = /^[\p{L}\s'.-]+$/u
export const cleanName = (v: string) => v.replace(/[^\p{L}\s'.-]/gu, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "")

// ---------- Entrega ----------
/** Regras de entrega da loja (públicas: vão para o navegador montar o checkout). */
export interface DeliveryConfig {
  enabled: boolean
  pricing: "fixed" | "zones" | "distance"
  fixedFee: number
  minOrder: number
  zones: { id: string; name: string; fee: number }[]
  /** Entrega por km: faixas "até X km → R$ Y" (em ordem) */
  tiers: { upToKm: number; fee: number }[]
  /** Entrega por km: a loja tem o ponto no mapa? (sem ele não dá para calcular) */
  hasLocation: boolean
  /** Cidade/UF da loja: sugestão para o endereço do cliente */
  city: string
  state: string
}

/** Ponto da loja (stores.location). */
export type StoreLocation = { lat: number; lng: number; label: string; city: string; state: string; source: "address" | "device" }

/** 4.2 → "4,2 km"; 8 → "8 km" */
export const formatKm = (km: number) => `${(Math.round(km * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`

/**
 * Taxa prevista para mostrar no checkout (o valor cobrado é o que create_order calcula no banco).
 * null = ainda falta escolher o bairro.
 */
export function previewDeliveryFee(config: DeliveryConfig, zoneId: string | null | undefined): number | null {
  if (config.pricing === "fixed") return config.fixedFee
  if (config.pricing === "distance") return null // vem do orçamento (endereço localizado no servidor)
  return config.zones.find((z) => z.id === zoneId)?.fee ?? null
}

/** A loja consegue entregar? (por bairro sem nenhum bairro cadastrado = não) */
export const deliveryAvailable = (c: DeliveryConfig) =>
  c.enabled && (c.pricing === "fixed" || (c.pricing === "zones" ? c.zones.length > 0 : c.tiers.length > 0 && c.hasLocation))

/** Endereço com o bairro, para a cozinha, a impressão e o cliente. */
export const fullAddress = (o: { deliveryAddress: string | null; deliveryZoneName: string | null; deliveryDistanceKm?: number | null }) =>
  [o.deliveryAddress, o.deliveryDistanceKm != null ? formatKm(o.deliveryDistanceKm) : o.deliveryZoneName].filter(Boolean).join(" — ")

// ---------- Endereço por partes (entrega por km) ----------
export type AddressParts = {
  cep: string | null
  street: string
  number: string
  district: string | null
  city: string
  state: string
  complement: string | null
}

const partText = (min: number, max: number, msg: string) => z.string().transform(sanitizeString).pipe(z.string().min(min, msg).max(max, msg))
const partOptional = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? sanitizeString(v) : "") || null)

export const addressPartsSchema = z.object({
  cep: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ?? "").replace(/\D/g, ""))
    .pipe(z.string().refine((v) => v === "" || v.length === 8, "CEP inválido"))
    .transform((v) => v || null),
  street: partText(2, 120, "Informe a rua"),
  number: partText(1, 10, "Informe o número (ou s/n)"),
  district: partOptional(80),
  city: partText(2, 80, "Informe a cidade"),
  state: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}$/, "UF inválida")),
  complement: partOptional(120),
})

/** Resultado do cálculo da entrega por km mostrado no checkout. */
export type QuoteView = { ok: true; km: number; fee: number; precise: boolean } | { ok: false; error: string }

/** Endereço em uma linha (vai para a cozinha, a impressão e o cliente). */
export function addressLine(p: AddressParts) {
  const cep = p.cep ? ` · CEP ${p.cep.slice(0, 5)}-${p.cep.slice(5)}` : ""
  const comp = p.complement ? ` (${p.complement})` : ""
  return `${p.street}, ${p.number}${comp}${p.district ? ` — ${p.district}` : ""}, ${p.city}/${p.state}${cep}`
}

// ---------- Validação da entrada de pedido ----------
const uuid = z.string().uuid()

export const cartInputSchema = z
  .array(
    z.object({
      menuItemId: uuid,
      quantity: z.number().int().min(1).max(20),
      extras: z
        .array(z.object({ ingredientId: uuid, quantity: z.number().int().min(1).max(10) }))
        .max(30)
        .default([]),
      // "SEM ___": ids de ingredientes da ficha do lanche (create_order confere se podem ser tirados)
      removals: z.array(uuid).max(30).default([]),
    }),
  )
  .min(1, "Adicione pelo menos um item")
  .max(50, "Pedido grande demais")

const optionalText = (max: number, msg: string) =>
  z
    .string()
    .max(max, msg)
    .transform(sanitizeString)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null)

export const orderInputSchema = z
  .object({
    customerName: z
      .string()
      .transform(sanitizeString)
      .pipe(
        z
          .string()
          .min(2, "Nome deve ter no mínimo 2 caracteres")
          .max(100, "Nome muito longo")
          .regex(NAME_ALLOWED, "Use só letras no nome"),
      ),
    customerPhone: z
      .string()
      .optional()
      .transform((v) => (v ?? "").replace(/\D/g, ""))
      .pipe(z.string().refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido"))
      .transform((v) => (v === "" ? null : v)),
    type: z.enum(["pickup", "delivery", "dine_in"]).default("pickup"),
    deliveryAddress: optionalText(300, "Endereço muito longo"),
    deliveryZoneId: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.string().uuid("Escolha um bairro da lista").nullable()),
    // Entrega por km: endereço por partes (o servidor localiza e calcula a distância)
    addressParts: addressPartsSchema.nullable().optional().transform((v) => v ?? null),
    paymentMethod: z.enum(["pix", "cash", "card_on_delivery"]).default("pix"),
    changeFor: z
      .string()
      .max(20)
      .optional()
      .transform((v) => parseMoneyBR(v))
      .pipe(z.number().max(10_000, "Valor de troco muito alto").nullable()),
    notes: optionalText(500, "Observações muito longas"),
    items: cartInputSchema,
  })
  .refine((o) => o.type !== "delivery" || !!o.deliveryAddress, {
    message: "Informe o endereço de entrega",
    path: ["deliveryAddress"],
  })

export type OrderInput = z.input<typeof orderInputSchema>
