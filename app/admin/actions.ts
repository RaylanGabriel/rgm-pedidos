"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNotNull, not } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { orders, stores } from "@/db/schema"
import { requireStore } from "@/lib/auth/session"
import { parseHours, scheduleState, storeOpenState } from "@/lib/hours"
import { dropPixCharge } from "@/lib/mercadopago"
import { createOrder, setOrderStatus, type CreateOrderResult } from "@/lib/orders"

const statusSchema = z.enum(["pending", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"])

/** Muda o status de um pedido da loja ativa. */
export async function updateOrderStatusAction(orderId: string, status: string) {
  const { store } = await requireStore()
  const parsed = statusSchema.safeParse(status)
  if (!parsed.success || !z.string().uuid().safeParse(orderId).success) return { ok: false as const }

  const ok = await setOrderStatus(store.id, orderId, parsed.data)
  revalidatePath("/admin/pedidos")
  return { ok }
}

/**
 * Pedido lançado no balcão pelo funcionário (vale mesmo com a loja "fechada" para o site).
 * pixQr: gera o QR do Pix no Mercado Pago para o cliente pagar ali (se a loja conectou a conta).
 */
export async function createCounterOrderAction(input: unknown, pixQr = false): Promise<CreateOrderResult> {
  const { store } = await requireStore()
  const result = await createOrder(store.id, input, { requireOpen: false, pixOnline: pixQr === true })
  if (result.ok) revalidatePath("/admin/pedidos")
  return result
}

const pixChoiceSchema = z.enum(["cash", "card_on_delivery", "pix", "cancel"])

/**
 * Balcão, Pix ainda não pago: o cliente pagou de outro jeito (dinheiro, cartão, Pix na chave da loja) ou desistiu.
 * Encerra a cobrança no Mercado Pago antes; se ela já tinha sido paga, não muda nada.
 */
export async function resolveCounterPixAction(orderId: string, choice: string): Promise<{ ok: boolean; paid?: boolean }> {
  const { store } = await requireStore()
  const parsed = pixChoiceSchema.safeParse(choice)
  if (!parsed.success || !z.string().uuid().safeParse(orderId).success) return { ok: false }
  const [o] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id), eq(orders.paymentStatus, "pending"), eq(orders.status, "pending"), isNotNull(orders.pixCode)))
    .limit(1)
  if (!o) return { ok: false }
  if ((await dropPixCharge(o.id)) === "paid") {
    revalidatePath("/admin/pedidos")
    return { ok: true, paid: true }
  }
  await db
    .update(orders)
    .set(
      parsed.data === "cancel"
        ? { status: "cancelled", completedAt: new Date() }
        : // sem o código do Pix o pedido sai da faixa "Aguardando Pix" e entra na cozinha
          { paymentMethod: parsed.data, mpOrderId: null, pixCode: null, pixExpiresAt: null },
    )
    .where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "pending")))
  revalidatePath("/admin/pedidos")
  return { ok: true }
}

/**
 * Abre/fecha a loja para pedidos pelo site.
 * No horário automático vira um ajuste temporário: vale até a próxima mudança do horário e depois volta ao normal.
 * Se já havia um ajuste valendo, tocar de novo só o desfaz (volta a seguir o horário).
 */
export async function toggleStoreOpenAction() {
  const { store } = await requireStore()
  const hours = store.hoursEnabled ? parseHours(store.openingHours) : null
  if (!hours) {
    await db.update(stores).set({ isOpen: not(stores.isOpen), manualUntil: null }).where(eq(stores.id, store.id))
  } else {
    const state = storeOpenState(store)
    if (state.manual) {
      await db.update(stores).set({ manualUntil: null, isOpen: true }).where(eq(stores.id, store.id))
    } else {
      const until = scheduleState(hours).changeAt ?? new Date(Date.now() + 24 * 3600_000)
      await db.update(stores).set({ isOpen: !state.open, manualUntil: until }).where(eq(stores.id, store.id))
    }
  }
  revalidatePath("/admin")
  revalidatePath(`/loja/${store.slug}`, "layout")
}
