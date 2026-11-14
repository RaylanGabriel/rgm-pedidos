"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, MapPin, ShieldCheck, UserCheck, UserRound } from "lucide-react"
import { addressLine } from "../conta/account-sections"
import type { AddressValue } from "../conta/account-forms"
import { Button } from "@/components/ui/button"
import { Turnstile } from "@/components/turnstile"
import { CartSummary, cartTotal } from "@/components/order/cart-summary"
import { CartSuggestions } from "@/components/order/cart-suggestions"
import { emptyOrderFields, OrderFields, type OrderFieldsValue } from "@/components/order/order-fields"
import { forgetCustomer, loadCustomer, saveCustomer, saveRecentOrder, toOrderItem, useCart } from "@/lib/cart"
import type { MenuView, PublicStore } from "@/lib/orders"
import { deliveryAvailable, formatBRL, newAttemptKey, previewDeliveryFee, type DeliveryConfig } from "@/lib/order-shared"
import { addressText, emptyAddressFields, partsFromFields, useDistanceQuote } from "@/components/order/distance-address"
import { placeOrder, quoteDeliveryAction } from "./actions"

export function CheckoutForm({
  store,
  menu,
  delivery,
  pixOnline = false,
  account = null,
  turnstileSiteKey = null,
}: {
  store: PublicStore
  menu: MenuView
  delivery: DeliveryConfig
  /** Loja conectou o Mercado Pago: Pix é pago pelo site logo depois de confirmar */
  pixOnline?: boolean
  /** Cliente logado (conta opcional): nome/WhatsApp e endereços salvos */
  account?: { email: string; name: string | null; phone: string | null; addresses: AddressValue[] } | null
  /** Turnstile: só aparece se o servidor pedir (rajada de pedidos na loja) */
  turnstileSiteKey?: string | null
}) {
  const cart = useCart(store.slug, menu)
  const router = useRouter()
  const [fields, setFields] = useState<OrderFieldsValue>(emptyOrderFields)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const placed = useRef(false) // pedido enviado: não redirecionar para o cardápio ao esvaziar o carrinho
  const errorRef = useRef<HTMLDivElement>(null)
  // Chave desta tentativa: se a resposta se perder (rede caiu) e o cliente tocar de novo, o servidor devolve o mesmo
  // pedido em vez de criar outro. Só é trocada quando o servidor RESPONDE (pedido feito, ou recusado sem criar nada).
  // `sent` = o pedido como foi enviado na 1ª vez: se o cliente mudou algo antes de repetir, avisamos em vez de esconder.
  const attempt = useRef<{ key: string; sent: string } | null>(null)
  const [received, setReceived] = useState<{ number: number; token: string } | null>(null)
  // Verificação anti-robô: desligada até o servidor pedir. O token vale um envio (key nova a cada resposta).
  const [captcha, setCaptcha] = useState<{ needed: boolean; token: string | null; key: number }>({ needed: false, token: null, key: 0 })
  const [remember, setRemember] = useState(true)
  const [usingSaved, setUsingSaved] = useState(false)
  // Conta: endereço salvo escolhido ("new" = digitar outro) e se o novo vai para a conta
  const [chosenAddress, setChosenAddress] = useState<string>("new")
  const [saveNewAddress, setSaveNewAddress] = useState(true)

  const applyAddress = (a: AddressValue) => {
    const parts = { cep: a.cep ?? "", street: a.street, number: a.number ?? "", district: a.district ?? "", city: a.city ?? "", state: a.state ?? "", complement: a.complement ?? "" }
    // Taxa por bairro: escolhe sozinho o bairro da loja com o mesmo nome
    const zone = a.district ? delivery.zones.find((z) => z.name.trim().toLowerCase() === a.district!.trim().toLowerCase()) : undefined
    setFields((f) => ({ ...f, address: parts, deliveryAddress: addressText(parts), deliveryZoneId: zone?.id ?? f.deliveryZoneId }))
    setChosenAddress(a.id)
  }

  // Preenche com os dados lembrados neste aparelho e, com conta, com os dados da conta (que valem em qualquer aparelho)
  useEffect(() => {
    const saved = loadCustomer()
    if (saved) {
      // Dados salvos podem ser de outra loja ou de antes de a lista de bairros mudar
      const canDeliver = deliveryAvailable(delivery)
      const zoneOk = delivery.zones.some((z) => z.id === saved.deliveryZoneId)
      setFields((f) => ({
        ...f,
        ...saved,
        type: saved.type === "delivery" && !canDeliver ? "pickup" : saved.type,
        deliveryZoneId: zoneOk ? saved.deliveryZoneId : "",
      }))
      if (!account) setUsingSaved(true)
    }
    if (account) {
      setFields((f) => ({ ...f, customerName: account.name || f.customerName, customerPhone: account.phone || f.customerPhone }))
      if (account.addresses[0]) applyAddress(account.addresses[0]) // o usado por último vem primeiro
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDelivery = fields.type === "delivery"
  const byDistance = isDelivery && delivery.pricing === "distance"
  const distance = useDistanceQuote(byDistance, fields.address, (parts) => quoteDeliveryAction(store.slug, parts))
  const fee = isDelivery ? (byDistance ? distance.fee : previewDeliveryFee(delivery, fields.deliveryZoneId)) : undefined
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
    if (cart.loaded && cart.lines.length === 0 && !placed.current) router.replace(store.base || "/")
  }, [cart.loaded, cart.lines.length, router, store.base])

  // Mostra o erro (no celular ele pode estar fora da tela)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [error])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setError(null)
    setErrors({})

    // Com conta: o endereço escolhido é marcado como usado; um novo vai para a conta se o cliente deixou marcado
    const zoneName = delivery.zones.find((z) => z.id === fields.deliveryZoneId)?.name ?? ""
    const typed = fields.address.street.trim()
      ? { label: "", ...fields.address }
      : fields.deliveryAddress.trim()
        ? { label: "", cep: "", street: fields.deliveryAddress.trim(), number: "", district: zoneName, city: "", state: "", complement: "" }
        : null
    const accountInfo =
      account && isDelivery
        ? chosenAddress !== "new"
          ? { addressId: chosenAddress }
          : { saveAddress: saveNewAddress ? typed : null }
        : undefined

    const body = {
      ...fields,
      ...(byDistance ? { deliveryAddress: addressText(fields.address), addressParts: partsFromFields(fields.address) } : {}),
      items: cart.lines.map(toOrderItem),
    }
    const sent = JSON.stringify(body)
    attempt.current ??= { key: newAttemptKey(), sent }
    const idempotencyKey = attempt.current.key
    const changed = attempt.current.sent !== sent
    setReceived(null)
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof placeOrder>>
      try {
        result = await placeOrder(store.slug, { ...body, idempotencyKey }, accountInfo, captcha.token)
      } catch {
        // Sem resposta: o pedido pode ter sido criado. Mantém a chave — tocar de novo não duplica.
        setError("Não conseguimos confirmar o envio (conexão instável?). Toque em confirmar de novo: se o pedido já tiver chegado, ele não será repetido.")
        return
      }
      attempt.current = null
      // token gasto: se a verificação estiver valendo (ou passou a valer agora), prepara outro
      if (captcha.needed || (!result.ok && result.needsCaptcha)) setCaptcha((c) => ({ needed: true, token: null, key: c.key + 1 }))

      if (!result.ok) {
        setError(result.error)
        setErrors(result.fieldErrors ?? {})
        return
      }
      if (result.duplicate && changed) {
        // A 1ª tentativa (antes da mudança) já tinha virado pedido: mostra qual, e o carrinho fica para um novo pedido
        saveRecentOrder(store.slug, { token: result.publicToken, number: result.orderNumber, createdAt: new Date().toISOString() })
        setReceived({ number: result.orderNumber, token: result.publicToken })
        return
      }
      placed.current = true
      // Com conta os dados já ficam na conta; sem conta, no aparelho (se o cliente deixou marcado)
      if (!account) {
        if (remember) saveCustomer(fields)
        else forgetCustomer()
      }
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
    byDistance ? (distance.loading ? "Calculando a entrega…" : distance.quote ? "Confira o endereço de entrega" : "Informe o endereço de entrega") : "Escolha o bairro"
  ) : (
    <>
      {pixOnline && fields.paymentMethod === "pix" ? "Confirmar e pagar com Pix" : "Confirmar pedido"} · {formatBRL(total)}
    </>
  )
  const waitingCaptcha = captcha.needed && !!turnstileSiteKey && !captcha.token
  const canSubmit = store.isOpen && !pending && !(isDelivery && fee === null) && !belowMin && !waitingCaptcha

  const trust = (
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden />
      {account ? "Pedido salvo na sua conta" : "Sem cadastro"} · você acompanha o pedido em tempo real
    </p>
  )

  return (
    <form onSubmit={submit} className="container mx-auto max-w-6xl px-4 pb-36 pt-4 lg:pb-12">
      <Link
        href={store.base || "/"}
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
          <CartSummary lines={cart.lines} menu={menu} onQuantity={cart.setQuantity} onRemove={cart.remove} onReplace={cart.replace} onInsertAfter={cart.insertAfter} deliveryFee={fee} feePendingLabel={byDistance ? (distance.loading ? "calculando…" : "informe o endereço") : undefined} />
          <CartSuggestions menu={menu} lines={cart.lines} onAdd={cart.add} />
          <div className="hidden space-y-3 lg:block">
            <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base font-semibold" disabled={!canSubmit}>
              {confirmLabel}
            </Button>
            {trust}
          </div>
        </aside>

        <div className="space-y-6 lg:order-1">
          {account ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <UserCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">
                  Pedido na sua conta <span className="text-muted-foreground">({account.email})</span>
                </span>
              </span>
              <Link href={`${store.base}/conta`} className="font-medium underline underline-offset-2 hover:text-primary">
                Minha conta
              </Link>
            </div>
          ) : usingSaved ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" aria-hidden />
                Preenchemos com os dados do seu último pedido.
              </span>
              <button type="button" onClick={forget} disabled={pending} className="font-medium underline underline-offset-2 hover:text-primary">
                Não é você? Apagar dados
              </button>
            </div>
          ) : (
            <Link
              href={`${store.base}/conta?volta=${encodeURIComponent(`${store.base}/finalizar`)}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm transition hover:border-primary"
            >
              <span>
                <span className="font-semibold">Tem conta? Entre</span>
                <span className="text-muted-foreground"> para preencher sozinho e salvar seus endereços (opcional).</span>
              </span>
              <UserRound className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            </Link>
          )}

          <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
            {account && isDelivery && account.addresses.length > 0 && (
              <fieldset className="mb-6">
                <legend className="mb-2 text-sm font-semibold">Entregar em</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {account.addresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => applyAddress(a)}
                      aria-pressed={chosenAddress === a.id}
                      disabled={pending}
                      className={`rounded-xl border-2 p-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        chosenAddress === a.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-semibold">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden />
                        {a.label || "Endereço"}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">{addressLine(a)}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setChosenAddress("new")
                      setFields((f) => ({ ...f, address: emptyAddressFields, deliveryAddress: "" }))
                    }}
                    aria-pressed={chosenAddress === "new"}
                    disabled={pending}
                    className={`rounded-xl border-2 border-dashed p-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      chosenAddress === "new" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    + Outro endereço
                  </button>
                </div>
              </fieldset>
            )}

            <OrderFields value={fields} onChange={setFields} errors={errors} disabled={pending} delivery={delivery} total={total} pixOnline={pixOnline} quote={distance.quote} quoteLoading={distance.loading} />

            {account ? (
              isDelivery &&
              chosenAddress === "new" && (
                <label className="mt-8 flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={saveNewAddress}
                    onChange={(e) => setSaveNewAddress(e.target.checked)}
                    disabled={pending}
                    className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
                  />
                  <span className="font-medium">Salvar este endereço na minha conta</span>
                </label>
              )
            ) : (
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
            )}

            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              Ao confirmar, seus dados vão para a {store.name} preparar e entregar o pedido, e você concorda com os{" "}
              <Link href="/termos" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                Termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                Política de privacidade
              </Link>
              .
            </p>
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
          {captcha.needed && turnstileSiteKey && (
            <Turnstile key={captcha.key} siteKey={turnstileSiteKey} action="pedido" onToken={(token) => setCaptcha((c) => ({ ...c, token }))} />
          )}
          {received && (
            <div role="status" className="rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm">
              <p className="font-semibold">Seu pedido #{received.number} já tinha sido recebido — sem a última alteração.</p>
              <p className="mt-1 text-muted-foreground">Confira o pedido. Se quiser também o que mudou, confirme de novo: vira um pedido separado.</p>
              <Link href={`/pedido/${received.token}`} className="mt-2 inline-block font-semibold text-primary underline-offset-4 hover:underline">
                Ver o pedido #{received.number}
              </Link>
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
