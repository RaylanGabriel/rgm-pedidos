import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "@/db"
import { orders, storePaymentAccounts } from "@/db/schema"
import { syncPixOrder, verifyWebhookSignature } from "@/lib/mercadopago"

/**
 * Avisos do Mercado Pago (aplicação RGM-PEDIDOS).
 * Nunca confiamos no conteúdo do aviso: ele só diz "olhe a cobrança X"; o status vem sempre da API do Mercado Pago
 * com o token da loja (syncPixOrder). A assinatura é conferida para barrar chamadas falsas.
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const body = (await req.json().catch(() => ({}))) as {
    type?: string
    topic?: string
    action?: string
    user_id?: number | string
    data?: { id?: string | number }
  }
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null)

  if (!verifyWebhookSignature(req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId)) {
    console.warn("Mercado Pago webhook: assinatura inválida", { type: body.type ?? url.searchParams.get("type"), dataId })
    return new Response("assinatura inválida", { status: 401 })
  }

  const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? ""
  const sellerId = body.user_id != null ? String(body.user_id) : null

  try {
    if (type === "order" && dataId) {
      // Cobrança da API de Orders: data.id é o id da order (guardado em orders.mp_order_id)
      const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.mpOrderId, dataId)).limit(1)
      if (o) await syncPixOrder(o.id)
    } else if (type === "payment" && sellerId) {
      // Aviso de pagamento: confere os Pix em aberto da loja desse vendedor
      const pending = await db
        .select({ id: orders.id })
        .from(orders)
        .innerJoin(storePaymentAccounts, eq(storePaymentAccounts.storeId, orders.storeId))
        .where(and(eq(storePaymentAccounts.mpUserId, sellerId), eq(orders.paymentStatus, "pending"), eq(orders.status, "pending"), isNotNull(orders.mpOrderId)))
        .limit(20)
      for (const o of pending) await syncPixOrder(o.id)
    } else if (type === "mp-connect" && sellerId && body.action?.includes("deauthorized")) {
      // Dono desconectou a RGM-PEDIDOS na conta dele: para de gerar Pix para essa loja
      await db.delete(storePaymentAccounts).where(eq(storePaymentAccounts.mpUserId, sellerId))
    }
  } catch (err) {
    // Responde erro para o Mercado Pago tentar de novo mais tarde
    console.error("Mercado Pago webhook: falha ao processar", type, dataId, err instanceof Error ? err.message : err)
    return new Response("erro", { status: 500 })
  }
  return new Response("ok", { status: 200 })
}
