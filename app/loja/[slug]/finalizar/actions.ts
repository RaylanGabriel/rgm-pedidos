"use server"

import { createOrder, getStoreBySlug, type CreateOrderResult } from "@/lib/orders"
import { clientIp, rateLimit } from "@/lib/rate-limit-server"

/** Pedido feito pelo cliente no site público. */
export async function placeOrder(slug: string, input: unknown): Promise<CreateOrderResult> {
  const store = await getStoreBySlug(slug)
  if (!store) return { ok: false, error: "Loja não encontrada." }

  // Anti-spam: até 10 pedidos a cada 10 minutos por IP em cada loja
  if (!(await rateLimit(`order:${store.id}:${await clientIp()}`, 10, 10 * 60 * 1000))) {
    return { ok: false, error: "Muitos pedidos em sequência. Aguarde alguns minutos e tente de novo." }
  }

  return createOrder(store.id, input, { requireOpen: true })
}
