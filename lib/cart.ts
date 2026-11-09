"use client"

import { useCallback, useEffect, useState } from "react"

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
