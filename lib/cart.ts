"use client"

import { useCallback, useEffect, useState } from "react"
import { PAYMENT_LABEL, TYPE_LABEL, type OrderType, type PaymentMethod } from "@/lib/order-shared"
import type { AddressFields } from "@/components/order/distance-address"

/**
 * Carrinho do cliente, guardado no localStorage por loja (chave cart:<slug>).
 * Os preços aqui servem só para exibir; o servidor recalcula tudo ao criar o pedido.
 */
export interface CartExtra {
  ingredientId: string
  name: string
  unitPrice: number
  quantity: number
}
export interface CartLine {
  menuItemId: string
  name: string
  unitPrice: number
  quantity: number
  extras: CartExtra[]
}

interface MenuLike {
  items: { id: string; name: string; price: number; available: boolean }[]
  ingredients: { id: string; name: string; price: number }[]
}

const cartKey = (slug: string) => `cart:${slug}`
const ordersKey = (slug: string) => `orders:${slug}`

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* modo anônimo / armazenamento cheio: segue sem persistir */
  }
}

/** Mantém só itens/adicionais que ainda existem no cardápio, com nome e preço atuais. */
function reconcile(lines: unknown, menu: MenuLike): CartLine[] {
  if (!Array.isArray(lines)) return []
  const items = new Map(menu.items.map((i) => [i.id, i]))
  const ings = new Map(menu.ingredients.map((i) => [i.id, i]))
  return lines.flatMap((l: Partial<CartLine>) => {
    const item = l && typeof l.menuItemId === "string" ? items.get(l.menuItemId) : undefined
    const qty = Number(l?.quantity)
    if (!item || !item.available || !Number.isInteger(qty) || qty < 1) return []
    const extras = (Array.isArray(l.extras) ? l.extras : []).flatMap((e: Partial<CartExtra>) => {
      const ing = e && typeof e.ingredientId === "string" ? ings.get(e.ingredientId) : undefined
      const q = Number(e?.quantity)
      return ing && Number.isInteger(q) && q >= 1 ? [{ ingredientId: ing.id, name: ing.name, unitPrice: ing.price, quantity: Math.min(q, 10) }] : []
    })
    return [{ menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: Math.min(qty, 20), extras }]
  })
}

export function useCart(slug: string, menu: MenuLike) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLines(reconcile(read(cartKey(slug), []), menu))
    setLoaded(true)
    // o cardápio vem do servidor e não muda durante a visita
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const update = useCallback(
    (fn: (prev: CartLine[]) => CartLine[]) =>
      setLines((prev) => {
        const next = fn(prev)
        write(cartKey(slug), next)
        return next
      }),
    [slug],
  )

  return {
    lines,
    loaded,
    add: (line: CartLine) => update((p) => [...p, line]),
    remove: (index: number) => update((p) => p.filter((_, i) => i !== index)),
    setQuantity: (index: number, quantity: number) =>
      update((p) => p.map((l, i) => (i === index ? { ...l, quantity: Math.min(20, Math.max(1, quantity)) } : l))),
    clear: () => update(() => []),
  }
}

// ---------- Dados do cliente lembrados no aparelho ----------
/**
 * Nome, WhatsApp, forma de receber, endereço e pagamento do último pedido.
 * Fica só neste navegador (vale para todas as lojas) e o cliente pode apagar a qualquer momento.
 */
export interface SavedCustomer {
  customerName: string
  customerPhone: string
  type: OrderType
  deliveryAddress: string
  deliveryZoneId: string
  /** Endereço por partes (lojas com entrega por km) */
  address: AddressFields
  paymentMethod: PaymentMethod
}

const CUSTOMER_KEY = "customer:v1"

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")

function readAddress(raw: unknown): AddressFields {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    cep: str(a.cep, 9),
    street: str(a.street, 120),
    number: str(a.number, 10),
    district: str(a.district, 80),
    city: str(a.city, 80),
    state: str(a.state, 2),
    complement: str(a.complement, 120),
  }
}

export function loadCustomer(): SavedCustomer | null {
  const raw = read<Record<string, unknown> | null>(CUSTOMER_KEY, null)
  if (!raw || typeof raw !== "object") return null
  const customerName = str(raw.customerName, 100).trim()
  if (!customerName) return null
  const type = str(raw.type, 20)
  const paymentMethod = str(raw.paymentMethod, 20)
  return {
    customerName,
    customerPhone: str(raw.customerPhone, 20),
    type: (type in TYPE_LABEL ? type : "pickup") as OrderType,
    deliveryAddress: str(raw.deliveryAddress, 300),
    deliveryZoneId: str(raw.deliveryZoneId, 36), // conferido contra os bairros da loja no checkout
    address: readAddress(raw.address),
    paymentMethod: (paymentMethod in PAYMENT_LABEL ? paymentMethod : "pix") as PaymentMethod,
  }
}

export function saveCustomer(c: SavedCustomer) {
  write(CUSTOMER_KEY, {
    customerName: c.customerName.trim(),
    customerPhone: c.customerPhone.trim(),
    type: c.type,
    deliveryAddress: c.deliveryAddress.trim(),
    deliveryZoneId: c.deliveryZoneId,
    address: readAddress(c.address),
    paymentMethod: c.paymentMethod,
  })
}

export function forgetCustomer() {
  try {
    localStorage.removeItem(CUSTOMER_KEY)
  } catch {
    /* sem armazenamento: nada a apagar */
  }
}

// ---------- Pedidos recentes do cliente (para reabrir o acompanhamento) ----------
export interface RecentOrder {
  token: string
  number: number
  createdAt: string
}

export function saveRecentOrder(slug: string, order: RecentOrder) {
  const list = read<RecentOrder[]>(ordersKey(slug), [])
  write(ordersKey(slug), [order, ...list.filter((o) => o.token !== order.token)].slice(0, 5))
}

export function useRecentOrders(slug: string) {
  const [orders, setOrders] = useState<RecentOrder[]>([])
  useEffect(() => {
    const list = read<RecentOrder[]>(ordersKey(slug), [])
    // Só mostra pedidos das últimas 24h
    setOrders(list.filter((o) => Date.now() - new Date(o.createdAt).getTime() < 24 * 60 * 60 * 1000))
  }, [slug])
  return orders
}
