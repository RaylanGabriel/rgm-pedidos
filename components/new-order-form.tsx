"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartSummary, cartTotal } from "@/components/order/cart-summary"
import { ItemPicker } from "@/components/order/item-picker"
import { emptyOrderFields, OrderFields, type OrderFieldsValue } from "@/components/order/order-fields"
import { createCounterOrderAction } from "@/app/admin/actions"
import { quoteDeliveryAction } from "@/app/loja/[slug]/finalizar/actions"
import { addressText, partsFromFields, useDistanceQuote } from "@/components/order/distance-address"
import type { CartLine } from "@/lib/cart"
import type { MenuView } from "@/lib/orders"
import { previewDeliveryFee, type DeliveryConfig } from "@/lib/order-shared"

/** Pedido lançado no balcão pelo painel. Carrinho só em memória (não usa o do site). */
export function NewOrderForm({
  menu,
  delivery,
  slug,
  pixOnline = false,
}: {
  menu: MenuView
  delivery: DeliveryConfig
  slug: string
  pixOnline?: boolean
}) {
  const router = useRouter()
  const [lines, setLines] = useState<CartLine[]>([])
  const [fields, setFields] = useState<OrderFieldsValue>(emptyOrderFields)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Pix com QR na tela (Mercado Pago conectado): o pedido só vai para a cozinha depois de pago
  const [pixQr, setPixQr] = useState(true)
  const showPixQr = pixOnline && fields.paymentMethod === "pix"
  const byDistance = fields.type === "delivery" && delivery.pricing === "distance"
  const distance = useDistanceQuote(byDistance, fields.address, (parts) => quoteDeliveryAction(slug, parts))
  const fee = fields.type === "delivery" ? (byDistance ? distance.fee : previewDeliveryFee(delivery, fields.deliveryZoneId)) : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setError(null)
    setErrors({})
    startTransition(async () => {
      const result = await createCounterOrderAction({
        ...fields,
        ...(byDistance ? { deliveryAddress: addressText(fields.address), addressParts: partsFromFields(fields.address) } : {}),
        items: lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          extras: l.extras.map((x) => ({ ingredientId: x.ingredientId, quantity: x.quantity })),
        })),
      }, showPixQr && pixQr)
      if (!result.ok) {
        setError(result.error)
        setErrors(result.fieldErrors ?? {})
        return
      }
      router.push(result.pixQr ? `/admin/pedidos/pix/${result.publicToken}` : "/admin/pedidos")
    })
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
      <ItemPicker menu={menu} onAdd={(l) => setLines((p) => [...p, l])} disabled={pending} />

      <form onSubmit={submit} className="space-y-6 lg:sticky lg:top-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Carrinho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CartSummary
              lines={lines}
              onQuantity={(i, q) => setLines((p) => p.map((l, j) => (j === i ? { ...l, quantity: Math.min(20, Math.max(1, q)) } : l)))}
              onRemove={(i) => setLines((p) => p.filter((_, j) => j !== i))}
              deliveryFee={lines.length ? fee : undefined}
              feePendingLabel={byDistance ? (distance.loading ? "calculando…" : "informe o endereço") : undefined}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados do pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <OrderFields value={fields} onChange={setFields} errors={errors} disabled={pending} delivery={delivery} total={lines.length ? cartTotal(lines) + (fee ?? 0) : undefined} quote={distance.quote} quoteLoading={distance.loading} />
            {showPixQr && (
              <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                  checked={pixQr}
                  onChange={(e) => setPixQr(e.target.checked)}
                  disabled={pending}
                />
                <span>
                  <span className="block font-semibold">Mostrar QR code do Pix para o cliente pagar agora</span>
                  <span className="block text-muted-foreground">
                    Confirmação automática: o pedido vai para a cozinha quando o Pix cair. Desmarque se o cliente já pagou na chave da loja.
                  </span>
                </span>
              </label>
            )}
            {error && (
              <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={pending || lines.length === 0}>
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando pedido…
                </>
              ) : (
                showPixQr && pixQr ? "Criar pedido e mostrar o QR" : "Criar pedido"
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
