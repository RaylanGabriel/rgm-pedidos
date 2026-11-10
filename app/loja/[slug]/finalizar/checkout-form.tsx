"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CartSummary } from "@/components/order/cart-summary"
import { emptyOrderFields, OrderFields, type OrderFieldsValue } from "@/components/order/order-fields"
import { forgetCustomer, loadCustomer, saveCustomer, saveRecentOrder, useCart } from "@/lib/cart"
import type { MenuView, PublicStore } from "@/lib/orders"
import { deliveryAvailable, previewDeliveryFee, type DeliveryConfig } from "@/lib/order-shared"
import { placeOrder } from "./actions"

export function CheckoutForm({ store, menu, delivery }: { store: PublicStore; menu: MenuView; delivery: DeliveryConfig }) {
  const cart = useCart(store.slug, menu)
  const router = useRouter()
  const [fields, setFields] = useState<OrderFieldsValue>(emptyOrderFields)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const placed = useRef(false) // pedido enviado: não redirecionar para o cardápio ao esvaziar o carrinho
  const [remember, setRemember] = useState(true)
  const [usingSaved, setUsingSaved] = useState(false)

  // Preenche com os dados lembrados neste aparelho
  useEffect(() => {
    const saved = loadCustomer()
    if (!saved) return
    // Dados salvos podem ser de outra loja ou de antes de a lista de bairros mudar
    const canDeliver = deliveryAvailable(delivery)
    const zoneOk = delivery.zones.some((z) => z.id === saved.deliveryZoneId)
    setFields((f) => ({
      ...f,
      ...saved,
      type: saved.type === "delivery" && !canDeliver ? "pickup" : saved.type,
      deliveryZoneId: zoneOk ? saved.deliveryZoneId : "",
    }))
    setUsingSaved(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDelivery = fields.type === "delivery"
  const fee = isDelivery ? previewDeliveryFee(delivery, fields.deliveryZoneId) : undefined

  const forget = () => {
    forgetCustomer()
    setFields(emptyOrderFields)
    setUsingSaved(false)
  }

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
      if (remember) saveCustomer(fields)
      else forgetCustomer()
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
          <CartSummary lines={cart.lines} deliveryFee={fee} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
          <CardDescription>Usamos só para identificar e avisar sobre o seu pedido.</CardDescription>
        </CardHeader>
        <CardContent>
          {usingSaved && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" aria-hidden />
                Preenchemos com os dados do seu último pedido.
              </span>
              <button type="button" onClick={forget} disabled={pending} className="font-medium underline underline-offset-2 hover:text-primary">
                Não é você? Apagar dados
              </button>
            </div>
          )}
          <form onSubmit={submit} className="space-y-6">
            <OrderFields value={fields} onChange={setFields} errors={errors} disabled={pending} delivery={delivery} />

            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={pending}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <span>
                <span className="font-medium">Lembrar meus dados neste aparelho</span>
                <span className="block text-muted-foreground">Na próxima compra o formulário já vem preenchido. Desmarque em celular compartilhado.</span>
              </span>
            </label>

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
