"use server"

import { quoteDistance, quoteError } from "@/lib/geo"
import { addressPartsSchema, type QuoteView } from "@/lib/order-shared"
import { createOrder, getStoreBySlug, type CreateOrderResult } from "@/lib/orders"
import { clientIp, rateLimit } from "@/lib/rate-limit-server"
import { TURNSTILE_ERROR, verifyTurnstile } from "@/lib/turnstile"

/** Pedido feito pelo cliente no site público. */
export async function placeOrder(slug: string, input: unknown, turnstileToken?: string | null): Promise<CreateOrderResult> {
  const store = await getStoreBySlug(slug)
  if (!store) return { ok: false, error: "Loja não encontrada." }

  // Anti-robô (Turnstile) antes de qualquer outra coisa: pedido falso nem chega a contar no limite
  if (!(await verifyTurnstile(turnstileToken, "pedido"))) return { ok: false, error: TURNSTILE_ERROR }

  // Anti-spam: até 10 pedidos a cada 10 minutos por IP em cada loja
  if (!(await rateLimit(`order:${store.id}:${await clientIp()}`, 10, 10 * 60 * 1000))) {
    return { ok: false, error: "Muitos pedidos em sequência. Aguarde alguns minutos e tente de novo." }
  }

  return createOrder(store.id, input, { requireOpen: true, pixOnline: true })
}

/** Entrega por km: distância e taxa para o endereço digitado (só mostra; o pedido recalcula no servidor). */
export async function quoteDeliveryAction(slug: string, rawParts: unknown): Promise<QuoteView> {
  const store = await getStoreBySlug(slug)
  if (!store || store.deliveryPricing !== "distance") return { ok: false, error: "Esta loja não calcula entrega por distância." }
  const parts = addressPartsSchema.safeParse(rawParts)
  if (!parts.success) return { ok: false, error: parts.error.issues[0]?.message ?? "Endereço incompleto." }
  // Cada endereço novo consulta o mapa: limite por IP para ninguém usar a loja como serviço de mapas
  if (!(await rateLimit(`quote:${await clientIp()}`, 40, 10 * 60 * 1000))) {
    return { ok: false, error: "Muitas consultas em sequência. Aguarde alguns minutos." }
  }
  const q = await quoteDistance(store, parts.data)
  return q.ok ? { ok: true, km: q.km, fee: q.fee, precise: q.precise } : { ok: false, error: quoteError(q) }
}
