"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BottomSheet } from "@/components/order/bottom-sheet"
import { CartSummary, cartTotal } from "@/components/order/cart-summary"
import { CartSuggestions } from "@/components/order/cart-suggestions"
import { ItemPicker } from "@/components/order/item-picker"
import { reconcile, useCart, useRecentOrders } from "@/lib/cart"
import { reorderAction } from "./conta/actions"
import type { MenuView, PublicStore } from "@/lib/orders"
import { formatBRL } from "@/lib/order-shared"

export function StoreMenu({ store, menu }: { store: PublicStore; menu: MenuView }) {
  const cart = useCart(store.slug, menu)
  const recent = useRecentOrders(store.slug)
  const [cartOpen, setCartOpen] = useState(false)
  const [reorderMsg, setReorderMsg] = useState<string | null>(null)
  const count = cart.lines.reduce((s, l) => s + l.quantity, 0)

  // "Pedir de novo" (Minha conta → ?pedirDeNovo=<token>): põe no carrinho o que ainda existe no cardápio, com preço atual
  const { loaded, addMany } = cart
  useEffect(() => {
    if (!loaded) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get("pedirDeNovo")
    if (!token) return
    params.delete("pedirDeNovo")
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`)
    reorderAction(store.slug, token).then((raw) => {
      if (!raw) return setReorderMsg("Não encontramos esse pedido nesta loja.")
      const lines = reconcile(raw, menu)
      if (lines.length) {
        addMany(lines)
        // celular: abre a sacola; no computador o carrinho já está à vista do lado
        if (window.matchMedia("(max-width: 1023px)").matches) setCartOpen(true)
      }
      setReorderMsg(
        !lines.length
          ? "Os itens desse pedido não estão mais disponíveis."
          : lines.length < raw.length
            ? "Pusemos no carrinho o que ainda está no cardápio (alguns itens saíram ou estão esgotados)."
            : "Pronto! O pedido está no carrinho, com os preços de hoje.",
      )
    })
    // roda uma vez, quando o carrinho salvo terminou de carregar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])
  const total = cartTotal(cart.lines)
  const checkoutHref = `${store.base}/finalizar`

  const checkoutButton = store.isOpen ? (
    <Button asChild size="lg" className="h-12 w-full rounded-full text-base font-semibold">
      <Link href={checkoutHref}>
        Finalizar pedido · {formatBRL(total)}
      </Link>
    </Button>
  ) : (
    <Button size="lg" className="h-12 w-full rounded-full" disabled>
      Loja fechada no momento
    </Button>
  )

  return (
    <div className={`container mx-auto max-w-6xl px-4 pb-8 ${count > 0 ? "pb-32 lg:pb-8" : ""}`}>
      {reorderMsg && (
        <div role="status" className="mt-5 flex items-start justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p>{reorderMsg}</p>
          <button type="button" onClick={() => setReorderMsg(null)} className="shrink-0 font-semibold text-primary">
            OK
          </button>
        </div>
      )}
      {!store.isOpen && (
        <div role="status" className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-semibold">A loja está fechada agora{store.openLabel ? ` · ${store.openLabel.toLowerCase()}` : ""}</p>
          <p className="text-sm text-muted-foreground">Dá para ver o cardápio e montar o carrinho; o pedido é feito quando a loja abrir.</p>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {recent.slice(0, 2).map((o) => (
            <Link
              key={o.token}
              href={`/pedido/${o.token}`}
              className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3 text-sm shadow-xs transition hover:border-primary/40"
            >
              <span>
                Acompanhar o pedido <strong>#{o.number}</strong>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ItemPicker menu={menu} onAdd={cart.add} />

        {/* Carrinho lateral (computador) */}
        <aside className="sticky top-20 mt-4 hidden rounded-3xl border bg-card p-5 shadow-sm lg:block" aria-label="Seu pedido">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <ShoppingBag className="h-5 w-5" aria-hidden />
            Seu pedido
          </h2>
          {cart.lines.length === 0 ? (
            <div className="py-8 text-center">
              <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="mt-3 font-medium">Seu carrinho está vazio</p>
              <p className="text-sm text-muted-foreground">Toque em um item para adicionar.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <CartSummary lines={cart.lines} menu={menu} onQuantity={cart.setQuantity} onRemove={cart.remove} onReplace={cart.replace} onInsertAfter={cart.insertAfter} />
              <CartSuggestions menu={menu} lines={cart.lines} onAdd={cart.add} />
              {checkoutButton}
            </div>
          )}
        </aside>
      </div>

      {/* Barra do carrinho (celular) */}
      {cart.loaded && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <button
            key={count /* reanima a cada item adicionado */}
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 rounded-full bg-primary px-3 text-primary-foreground shadow-xl animate-in zoom-in-95 duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
          >
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-primary-foreground/20 px-2 text-sm font-bold tabular-nums">
              {count}
            </span>
            <span className="flex-1 text-left font-semibold">Ver carrinho</span>
            <span className="pr-2 font-bold tabular-nums">{formatBRL(total)}</span>
          </button>
        </div>
      )}

      <BottomSheet
        open={cartOpen && count > 0}
        onOpenChange={setCartOpen}
        title="Seu pedido"
        footer={checkoutButton}
      >
        <div className="space-y-5 px-5 pb-5">
          <CartSummary lines={cart.lines} menu={menu} onQuantity={cart.setQuantity} onRemove={cart.remove} onReplace={cart.replace} onInsertAfter={cart.insertAfter} />
          <CartSuggestions menu={menu} lines={cart.lines} onAdd={cart.add} />
        </div>
      </BottomSheet>
    </div>
  )
}
