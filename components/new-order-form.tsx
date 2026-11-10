"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartSummary } from "@/components/order/cart-summary"
import { ItemPicker } from "@/components/order/item-picker"
import { emptyOrderFields, OrderFields, type OrderFieldsValue } from "@/components/order/order-fields"
import { createCounterOrderAction } from "@/app/admin/actions"
import type { CartLine } from "@/lib/cart"
import type { MenuView } from "@/lib/orders"
import { previewDeliveryFee, type DeliveryConfig } from "@/lib/order-shared"

/** Pedido lançado no balcão pelo painel. Carrinho só em memória (não usa o do site). */
export function NewOrderForm({ menu, delivery }: { menu: MenuView; delivery: DeliveryConfig }) {
  const router = useRouter()
  const [lines, setLines] = useState<CartLine[]>([])
  const [fields, setFields] = useState<OrderFieldsValue>(emptyOrderFields)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fee = fields.type === "delivery" ? previewDeliveryFee(delivery, fields.deliveryZoneId) : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setError(null)
    setErrors({})
    startTransition(async () => {
      const result = await createCounterOrderAction({
        ...fields,
        items: lines.map((l) => ({
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
      router.push("/admin/pedidos")
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">
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
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados do pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <OrderFields value={fields} onChange={setFields} errors={errors} disabled={pending} delivery={delivery} />
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
                "Criar pedido"
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
