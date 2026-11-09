"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CartSummary } from "@/components/order/cart-summary"
import { emptyOrderFields, OrderFields, type OrderFieldsValue } from "@/components/order/order-fields"
import { saveRecentOrder, useCart } from "@/lib/cart"
import type { MenuView, PublicStore } from "@/lib/orders"
import { placeOrder } from "./actions"

export function CheckoutForm({ store, menu }: { store: PublicStore; menu: MenuView }) {
  const cart = useCart(store.slug, menu)
  const router = useRouter()
  const [fields, setFields] = useState<OrderFieldsValue>(emptyOrderFields)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const placed = useRef(false) // pedido enviado: não redirecionar para o cardápio ao esvaziar o carrinho

  // Carrinho vazio (ou itens que saíram do cardápio) → volta para o cardápio
  useEffect(() => {
    if (cart.loaded && cart.lines.length === 0 && !placed.current) router.replace(`/loja/${store.slug}`)
  }, [cart.loaded, cart.lines.length, router, store.slug])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setError(null)
    setErrors({})

    startTransition(async () => {
      const result = await placeOrder(store.slug, {
        ...fields,
        items: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          extras: l.extras.map((x) => ({ ingredientId: x.ingredientId, quantity: x.quantity })),
        })),
      })

      if (!result.ok) {
        setError(result.error)
        setErrors(result.fieldErrors ?? {})
        return
      }
      placed.current = true
      saveRecentOrder(store.slug, { token: result.publicToken, number: result.orderNumber, createdAt: new Date().toISOString() })
      router.push(`/pedido/${result.publicToken}`)
      cart.clear()
    })
  }

  if (!cart.loaded || cart.lines.length === 0) return null

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-6">
        <Link href={`/loja/${store.slug}`}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar ao cardápio
        </Link>
      </Button>

      <h1 className="text-3xl font-bold mb-8 text-center">Finalizar pedido</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <CartSummary lines={cart.lines} />
          <p className="text-xs text-muted-foreground mt-3">O valor final é confirmado pela loja ao registrar o pedido.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
          <CardDescription>Usamos só para identificar e avisar sobre o seu pedido.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <OrderFields value={fields} onChange={setFields} errors={errors} disabled={pending} />

            {error && (
              <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={pending || !store.isOpen}>
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando pedido…
                </>
              ) : store.isOpen ? (
                "Confirmar pedido"
              ) : (
                "Loja fechada"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
