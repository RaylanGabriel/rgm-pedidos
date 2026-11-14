"use server"

import { revalidatePath } from "next/cache"
import { confirmDeliveryByToken } from "@/lib/orders"
import { clientIpKey, rateLimit } from "@/lib/rate-limit-server"

/** Cliente toca "Recebi meu pedido" na tela de acompanhamento. */
export async function confirmDeliveryAction(token: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, error: "Pedido inválido." }
  if (!(await rateLimit(`confirm:${await clientIpKey()}`, 20, 10 * 60 * 1000))) {
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." }
  }

  const ok = await confirmDeliveryByToken(token)
  revalidatePath(`/pedido/${token}`)
  revalidatePath("/admin/pedidos")
  // Se não mudou, o pedido já foi finalizado pela loja (ou não está a caminho): a página atualizada mostra o estado real
  return { ok }
}
