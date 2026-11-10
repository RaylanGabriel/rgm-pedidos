"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, ShieldCheck, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartSummary, cartTotal } from "@/components/order/cart-summary"
import { CartSuggestions } from "@/components/order/cart-suggestions"
import { emptyOrderFields, OrderFields, type OrderFieldsValue } from "@/components/order/order-fields"
import { forgetCustomer, loadCustomer, saveCustomer, saveRecentOrder, useCart } from "@/lib/cart"
import type { MenuView, PublicStore } from "@/lib/orders"
import { deliveryAvailable, formatBRL, previewDeliveryFee, type DeliveryConfig } from "@/lib/order-shared"
import { placeOrder } from "./actions"

export function CheckoutForm({ store, menu, delivery }: { store: PublicStore; menu: MenuView; delivery: DeliveryConfig }) {
  const cart = useCart(store.slug, menu)
  const router = useRouter()
  const [fields, setFields] = useState<OrderFieldsValue>(emptyOrderFields)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const placed = useRef(false) // pedido enviado: não redirecionar para o cardápio ao esvaziar o carrinho
  const errorRef = useRef<HTMLDivElement>(null)
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
  const subtotal = cartTotal(cart.lines)
  const total = subtotal + (fee ?? 0)
  const belowMin = isDelivery && delivery.minOrder > 0 && subtotal < delivery.minOrder

  const forget = () => {
    forgetCustomer()
    setFields(emptyOrderFields)
    setUsingSaved(false)
  }

  // Carrinho vazio (ou itens que saíram do cardápio) → volta para o cardápio
  useEffect(() => {
    if (cart.loaded && cart.lines.length === 0 && !placed.current) router.replace(`/loja/${store.slug}`)
  }, [cart.loaded, cart.lines.length, router, store.slug])

  // Mostra o erro (no celular ele pode estar fora da tela)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [error])

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

  const confirmLabel = pending ? (
    <>
      <Loader2 className="h-5 w-5 animate-spin" />
      Enviando pedido…
    </>
  ) : !store.isOpen ? (
    "Loja fechada no momento"
  ) : isDelivery && fee === null ? (
    "Escolha o bairro"
  ) : (
    <>Confirmar pedido · {formatBRL(total)}</>
  )
  const canSubmit = store.isOpen && !pending && !(isDelivery && fee === null) && !belowMin

  const trust = (
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden />
      Sem cadastro · você acompanha o pedido em tempo real
    </p>
  )

  return (
    <form onSubmit={submit} className="container mx-auto max-w-6xl px-4 pb-36 pt-4 lg:pb-12">
      <Link
        href={`/loja/${store.slug}`}
        className="-ml-2 inline-flex h-10 items-center gap-2 rounded-full px-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Continuar escolhendo
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Finalizar pedido</h1>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Resumo (no celular vem primeiro; no computador fica fixo à direita) */}
        <aside className="space-y-5 rounded-3xl border bg-card p-5 shadow-sm lg:sticky lg:top-20 lg:order-2" aria-label="Resumo do pedido">
          <h2 className="text-lg font-bold">Seu pedido</h2>
          <CartSummary lines={cart.lines} onQuantity={cart.setQuantity} onRemove={cart.remove} deliveryFee={fee} />
          <CartSuggestions menu={menu} lines={cart.lines} onAdd={cart.add} max={4} />
          <div className="hidden space-y-3 lg:block">
            <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base font-semibold" disabled={!canSubmit}>
              {confirmLabel}
            </Button>
            {trust}
          </div>
        </aside>

        <div className="space-y-6 lg:order-1">
          {usingSaved && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" aria-hidden />
                Preenchemos com os dados do seu último pedido.
              </span>
              <button type="button" onClick={forget} disabled={pending} className="font-medium underline underline-offset-2 hover:text-primary">
                Não é você? Apagar dados
              </button>
            </div>
          )}

          <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
            <OrderFields value={fields} onChange={setFields} errors={errors} disabled={pending} delivery={delivery} total={total} />

            <label className="mt-8 flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={pending}
                className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
              />
              <span>
                <span className="font-medium">Lembrar meus dados neste aparelho</span>
                <span className="block text-muted-foreground">Na próxima compra o formulário já vem preenchido. Desmarque em celular compartilhado.</span>
              </span>
            </label>
          </div>

          {belowMin && (
            <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              Faltam <strong>{formatBRL(delivery.minOrder - subtotal)}</strong> para o pedido mínimo de entrega ({formatBRL(delivery.minOrder)}). Adicione
              mais itens ou escolha retirada.
            </div>
          )}

          {error && (
            <div ref={errorRef} role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Botão fixo (celular) */}
      <div className="fixed inset-x-0 bottom-0 z-40 space-y-2 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <Button type="submit" size="lg" className="mx-auto flex h-12 w-full max-w-lg rounded-full text-base font-semibold" disabled={!canSubmit}>
          {confirmLabel}
        </Button>
        {trust}
      </div>
    </form>
  )
}
