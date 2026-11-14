"use server"

import { z } from "zod"
import { getCustomer } from "@/lib/auth/customer"
import { addressSchema, afterOrder } from "@/lib/customer-account"
import { quoteDistance, quoteError } from "@/lib/geo"
import { addressPartsSchema, type QuoteView } from "@/lib/order-shared"
import { createOrder, existingAttempt, getStoreBySlug, orderBurst, type CreateOrderResult } from "@/lib/orders"
import { clientIpKey, rateLimit } from "@/lib/rate-limit-server"
import { verifyTurnstile } from "@/lib/turnstile"

/**
 * Pedido feito pelo cliente no site público. Com conta (cookie csid): o pedido fica na conta e o endereço usado
 * é marcado (ou salvo, se for novo e o cliente pediu).
 */
export async function placeOrder(
  slug: string,
  input: unknown,
  account?: { addressId?: string | null; saveAddress?: unknown },
  captchaToken?: string | null,
): Promise<CreateOrderResult> {
  const store = await getStoreBySlug(slug)
  if (!store) return { ok: false, error: "Loja não encontrada." }

  // Repetição de uma tentativa que já criou o pedido (resposta perdida): devolve o pedido antes de qualquer
  // recusa (limite de pedidos, loja fechando) — senão o cliente ouviria "não deu" e duplicaria na próxima
  const again = await existingAttempt(store.id, input)
  if (again) return again

  // Anti-spam: até 10 pedidos a cada 10 minutos por IP em cada loja
  if (!(await rateLimit(`order:${store.id}:${await clientIpKey()}`, 10, 10 * 60 * 1000))) {
    return { ok: false, error: "Muitos pedidos em sequência. Aguarde alguns minutos e tente de novo." }
  }

  // Rajada de pedidos na loja (provável robô): só então pede o Turnstile. No dia a dia o cliente nunca vê.
  if ((await orderBurst(store.id)) && !(await verifyTurnstile(captchaToken, "pedido"))) {
    return { ok: false, error: "A loja está recebendo muitos pedidos agora. Confirme a verificação abaixo e toque em confirmar de novo.", needsCaptcha: true }
  }

  const result = await createOrder(store.id, input, { requireOpen: true, pixOnline: true })
  // O pedido já existe: falhar aqui (conta do cliente) nunca pode virar erro para quem pediu — ele repetiria o pedido
  const me = result.ok ? await getCustomer().catch(() => null) : null
  if (result.ok && me) {
    const addressId = z.string().uuid().safeParse(account?.addressId)
    const newAddress = account?.saveAddress ? addressSchema.safeParse(account.saveAddress) : null
    const fields = input as { customerName?: unknown; customerPhone?: unknown }
    await afterOrder(me, result.publicToken, {
      addressId: addressId.success ? addressId.data : null,
      newAddress: newAddress?.success ? newAddress.data : null,
      name: typeof fields?.customerName === "string" ? fields.customerName.trim() : undefined,
      phone: typeof fields?.customerPhone === "string" ? fields.customerPhone : undefined,
    })
  }
  return result
}

/** Entrega por km: distância e taxa para o endereço digitado (só mostra; o pedido recalcula no servidor). */
export async function quoteDeliveryAction(slug: string, rawParts: unknown): Promise<QuoteView> {
  const store = await getStoreBySlug(slug)
  if (!store || store.deliveryPricing !== "distance") return { ok: false, error: "Esta loja não calcula entrega por distância." }
  const parts = addressPartsSchema.safeParse(rawParts)
  if (!parts.success) return { ok: false, error: parts.error.issues[0]?.message ?? "Endereço incompleto." }
  // Cada endereço novo consulta o mapa: limite por IP para ninguém usar a loja como serviço de mapas
  if (!(await rateLimit(`quote:${await clientIpKey()}`, 40, 10 * 60 * 1000))) {
    return { ok: false, error: "Muitas consultas em sequência. Aguarde alguns minutos." }
  }
  const q = await quoteDistance(store, parts.data)
  return q.ok ? { ok: true, km: q.km, fee: q.fee, precise: q.precise } : { ok: false, error: quoteError(q) }
}
