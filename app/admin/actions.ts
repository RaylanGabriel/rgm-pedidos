"use server"

import { revalidatePath } from "next/cache"
import { eq, not } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { stores } from "@/db/schema"
import { requireStore } from "@/lib/auth/session"
import { createOrder, setOrderStatus, type CreateOrderResult } from "@/lib/orders"

const statusSchema = z.enum(["pending", "preparing", "ready", "delivered", "cancelled"])

/** Muda o status de um pedido da loja ativa. */
export async function updateOrderStatusAction(orderId: string, status: string) {
  const { store } = await requireStore()
  const parsed = statusSchema.safeParse(status)
  if (!parsed.success || !z.string().uuid().safeParse(orderId).success) return { ok: false as const }

  const ok = await setOrderStatus(store.id, orderId, parsed.data)
  revalidatePath("/admin/pedidos")
  return { ok }
}

/** Pedido lançado no balcão pelo funcionário (vale mesmo com a loja "fechada" para o site). */
export async function createCounterOrderAction(input: unknown): Promise<CreateOrderResult> {
  const { store } = await requireStore()
  const result = await createOrder(store.id, input, { requireOpen: false })
  if (result.ok) revalidatePath("/admin/pedidos")
  return result
}

/** Abre/fecha a loja para pedidos pelo site. */
export async function toggleStoreOpenAction() {
  const { store } = await requireStore()
  await db.update(stores).set({ isOpen: not(stores.isOpen) }).where(eq(stores.id, store.id))
  revalidatePath("/admin")
}
