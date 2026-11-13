import "server-only"

import { and, asc, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { customerAddresses, customers, orders } from "@/db/schema"
import type { OrderStatus } from "@/lib/order-shared"

/*
 * Dados da conta do cliente: perfil, endereços, pedidos (de todas as lojas) e apagar a conta.
 * Tudo filtrado pelo customer_id da sessão (nunca por id vindo do formulário sozinho).
 */

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "WhatsApp com DDD, só números")
    .transform((v) => v || null),
})

export const addressSchema = z.object({
  label: opt(30),
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 8, "CEP com 8 números")
    .transform((v) => v || null),
  street: z.string().trim().min(3, "Informe a rua").max(120),
  number: opt(20),
  district: opt(60),
  city: opt(60),
  state: opt(2),
  complement: opt(80),
})
export type AddressInput = z.infer<typeof addressSchema>

export const getAddresses = (customerId: string) =>
  db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(sql`${customerAddresses.lastUsedAt} desc nulls last`, asc(customerAddresses.createdAt))

export async function saveAddress(customerId: string, data: AddressInput, id?: string) {
  if (id) {
    await db
      .update(customerAddresses)
      .set(data)
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)))
    return id
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(customerAddresses).where(eq(customerAddresses.customerId, customerId))
  if (n >= 10) throw new Error("ADDRESS_LIMIT")
  const [row] = await db.insert(customerAddresses).values({ ...data, customerId }).returning({ id: customerAddresses.id })
  return row.id
}

export const deleteAddress = (customerId: string, id: string) =>
  db.delete(customerAddresses).where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)))

export const updateProfile = (customerId: string, data: z.infer<typeof profileSchema>) =>
  db.update(customers).set(data).where(eq(customers.id, customerId))

export interface CustomerOrder {
  token: string
  orderNumber: number
  createdAt: string
  status: OrderStatus
  total: number
  store: { name: string; slug: string }
  summary: string
}

/** Pedidos da conta em todas as lojas, mais recentes primeiro (até 50). */
export async function listCustomerOrders(customerId: string): Promise<CustomerOrder[]> {
  const rows = await db.query.orders.findMany({
    where: eq(orders.customerId, customerId),
    orderBy: desc(orders.createdAt),
    limit: 50,
    columns: { publicToken: true, orderNumber: true, createdAt: true, status: true, total: true },
    with: { store: { columns: { name: true, slug: true } }, items: { columns: { nameSnapshot: true, quantity: true } } },
  })
  return rows.map((r) => ({
    token: r.publicToken,
    orderNumber: r.orderNumber,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    total: Number(r.total),
    store: r.store,
    summary: r.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(", "),
  }))
}

/** Liga um pedido recém-criado à conta e marca o endereço usado. */
export async function attachOrder(customerId: string, orderId: string, addressId?: string | null) {
  await db.update(orders).set({ customerId }).where(eq(orders.id, orderId))
  if (addressId)
    await db
      .update(customerAddresses)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
}

/**
 * Apagar a conta (LGPD): some o e-mail, nome, telefone, endereços e sessões. Os pedidos ficam com a loja (nome e
 * telefone do pedido, como em qualquer pedido sem conta), só perdem a ligação com a conta.
 */
export const deleteCustomer = (customerId: string) => db.delete(customers).where(eq(customers.id, customerId))

/** Itens de um pedido antigo, no formato do carrinho (o navegador confere contra o cardápio atual). */
export async function reorderItems(token: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.publicToken, token),
    columns: { storeId: true },
    with: {
      items: {
        columns: { menuItemId: true, quantity: true },
        with: { extras: { columns: { ingredientId: true, quantity: true } }, removals: { columns: { ingredientId: true } } },
      },
    },
  })
  if (!order) return null
  return {
    storeId: order.storeId,
    lines: order.items
      .filter((i) => i.menuItemId)
      .map((i) => ({
        menuItemId: i.menuItemId!,
        quantity: i.quantity,
        extras: i.extras.filter((e) => e.ingredientId).map((e) => ({ ingredientId: e.ingredientId!, quantity: e.quantity })),
        removals: i.removals.filter((r) => r.ingredientId).map((r) => ({ ingredientId: r.ingredientId! })),
      })),
  }
}
