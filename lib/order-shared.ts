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
}

export interface OrderView {
  id: string
  orderNumber: number
  publicToken: string
  customerName: string
  customerPhone: string | null
  type: OrderType
  deliveryAddress: string | null
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

// ---------- Entrega ----------
/** Regras de entrega da loja (públicas: vão para o navegador montar o checkout). */
export interface DeliveryConfig {
  enabled: boolean
  pricing: "fixed" | "zones"
  fixedFee: number
  minOrder: number
  zones: { id: string; name: string; fee: number }[]
}

/**
 * Taxa prevista para mostrar no checkout (o valor cobrado é o que create_order calcula no banco).
 * null = ainda falta escolher o bairro.
 */
export function previewDeliveryFee(config: DeliveryConfig, zoneId: string | null | undefined): number | null {
  if (config.pricing === "fixed") return config.fixedFee
  return config.zones.find((z) => z.id === zoneId)?.fee ?? null
}

/** A loja consegue entregar? (por bairro sem nenhum bairro cadastrado = não) */
export const deliveryAvailable = (c: DeliveryConfig) => c.enabled && (c.pricing === "fixed" || c.zones.length > 0)

/** Endereço com o bairro, para a cozinha, a impressão e o cliente. */
export const fullAddress = (o: { deliveryAddress: string | null; deliveryZoneName: string | null }) =>
  [o.deliveryAddress, o.deliveryZoneName].filter(Boolean).join(" — ")

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
      .pipe(z.string().min(2, "Nome deve ter no mínimo 2 caracteres").max(100, "Nome muito longo")),
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
