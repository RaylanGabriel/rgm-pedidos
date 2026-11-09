"use client"

import Link from "next/link"
import { ClipboardList, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartSummary } from "@/components/order/cart-summary"
import { ItemPicker } from "@/components/order/item-picker"
import { useCart, useRecentOrders } from "@/lib/cart"
import type { MenuView, PublicStore } from "@/lib/orders"

export function StoreMenu({ store, menu }: { store: PublicStore; menu: MenuView }) {
  const cart = useCart(store.slug, menu)
  const recent = useRecentOrders(store.slug)

  return (
    <div className="container mx-auto px-4 py-8">
      {!store.isOpen && (
        <div role="status" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center">
          <p className="font-semibold">A loja está fechada agora.</p>
          <p className="text-sm text-muted-foreground">Você pode ver o cardápio, mas os pedidos estão pausados.</p>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Seus pedidos de hoje:</span>
          {recent.map((o) => (
            <Link key={o.token} href={`/pedido/${o.token}`} className="font-semibold text-primary hover:underline">
              #{o.number}
            </Link>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <ItemPicker menu={menu} onAdd={cart.add} />

        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Seu pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CartSummary lines={cart.lines} onQuantity={cart.setQuantity} onRemove={cart.remove} />
            {cart.lines.length > 0 &&
              (store.isOpen ? (
                <Button asChild className="w-full" size="lg">
                  <Link href={`/loja/${store.slug}/finalizar`}>Finalizar pedido</Link>
                </Button>
              ) : (
                <Button className="w-full" size="lg" disabled>
                  Loja fechada
                </Button>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
