import Link from "next/link"
import { notFound } from "next/navigation"
import { Bike, CheckCircle2, ChefHat, Clock, MapPin, MessageCircle, Package, ShoppingBag, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AutoRefresh } from "@/components/auto-refresh"
import { StoreFooter, StoreHeader } from "@/components/store/store-header"
import { brandStyle } from "@/lib/color"
import { formatDateTimeSP, formatTimeSP } from "@/lib/dates"
import { mapsLink, whatsappLink } from "@/lib/links"
import { getOrderByToken } from "@/lib/orders"
import { changeText, formatBRL, fullAddress, lineTotal, orderSteps, PAYMENT_LABEL, STATUS_LABEL, TYPE_LABEL, type OrderStatus } from "@/lib/order-shared"
import { cn } from "@/lib/utils"
import { ConfirmDelivery } from "./confirm-delivery"

export const metadata = { title: "Acompanhar pedido", robots: { index: false } }

const STEP_ICON: Record<OrderStatus, typeof Clock> = {
  pending: Clock,
  preparing: ChefHat,
  ready: CheckCircle2,
  out_for_delivery: Bike,
  delivered: Package,
  cancelled: XCircle,
}
/** Rótulo curto da barra de progresso */
const SHORT_LABEL: Partial<Record<OrderStatus, string>> = { out_for_delivery: "A caminho" }

export default async function PedidoPage({ params }: { params: Promise<{ token: string }> }) {
  const data = await getOrderByToken((await params).token)
  if (!data) notFound()
  const { order, store } = data
  const finished = order.status === "delivered" || order.status === "cancelled"
  const steps = orderSteps(order.type) // mesma sequência do quadro da cozinha
  const step = steps.indexOf(order.status)
  const isDelivery = order.type === "delivery"
  // Momento de agir: retirar no balcão, ou o pedido está chegando
  const highlight = (order.status === "ready" && !isDelivery) || order.status === "out_for_delivery"
  const eta = formatTimeSP(new Date(new Date(order.createdAt).getTime() + order.estimatedWaitMinutes * 60_000).toISOString())

  const headline: Record<OrderStatus, { title: string; text: string }> = {
    pending: { title: "Recebemos seu pedido!", text: `A loja já foi avisada. Previsão: por volta das ${eta}.` },
    preparing: { title: "Seu pedido está sendo preparado", text: `Previsão: por volta das ${eta}.` },
    ready: isDelivery
      ? { title: "Pedido pronto!", text: "Aguardando o entregador sair com o seu pedido." }
      : { title: "Pronto! Pode retirar", text: `Diga o número #${order.orderNumber} no balcão.` },
    out_for_delivery: { title: "Saiu para entrega!", text: "Seu pedido está a caminho. Fique de olho no interfone." },
    delivered: { title: "Pedido entregue", text: "Bom apetite! Obrigado pela preferência." },
    cancelled: { title: "Pedido cancelado", text: "Em caso de dúvida, fale com a loja." },
  }
  const { title, text } = headline[order.status]
  const Icon = STEP_ICON[order.status]

  const whats = whatsappLink(store.phone, `Olá! Sobre o meu pedido #${order.orderNumber} (${order.customerName}).`)
  const map = !isDelivery ? mapsLink(store.address) : null

  return (
    <div style={brandStyle(store.primaryColor)} className="flex min-h-screen flex-col bg-background">
      {!finished && <AutoRefresh seconds={10} />}
      <StoreHeader store={store} />

      <main className="flex-1">
        <div className="container mx-auto max-w-xl space-y-4 px-4 py-6">
          {/* Status */}
          <section
            className={cn(
              "overflow-hidden rounded-3xl border shadow-sm",
              highlight ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950" : "bg-card",
              order.status === "cancelled" && "border-destructive/30 bg-destructive/5",
            )}
            aria-live="polite"
          >
            <div className="flex items-start gap-4 p-5">
              <span
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                  highlight ? "bg-green-600 text-white" : order.status === "cancelled" ? "bg-destructive text-white" : "bg-primary text-primary-foreground",
                )}
                aria-hidden
              >
                <Icon className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">Pedido #{order.orderNumber}</p>
                <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">{title}</h1>
                <p className="mt-1 text-muted-foreground">{text}</p>
              </div>
            </div>

            {order.status !== "cancelled" && (
              <div className="px-5 pb-5">
                <ol className={cn("grid gap-1.5", steps.length === 5 ? "grid-cols-5" : "grid-cols-4")} aria-label="Andamento do pedido">
                  {steps.map((s, i) => (
                    <li key={s} aria-current={i === step ? "step" : undefined}>
                      <span className={cn("block h-1.5 rounded-full", i <= step ? (highlight ? "bg-green-600" : "bg-primary") : "bg-muted")} />
                      <span className={cn("mt-1.5 block leading-tight", steps.length === 5 ? "text-[11px]" : "text-xs", i === step ? "font-bold" : "text-muted-foreground")}>
                        {SHORT_LABEL[s] ?? STATUS_LABEL[s]}
                      </span>
                    </li>
                  ))}
                </ol>
                {order.status === "out_for_delivery" && (
                  <div className="mt-4 space-y-2 rounded-2xl bg-background/80 p-4">
                    <p className="text-sm font-semibold">Já chegou? Avise a loja com um toque:</p>
                    <ConfirmDelivery token={order.publicToken} />
                    <p className="text-xs text-muted-foreground">Se você não confirmar, marcamos como entregue 1 hora depois da saída.</p>
                  </div>
                )}
                {order.status === "delivered" && order.autoDelivered && (
                  <p className="mt-3 text-sm text-muted-foreground">Marcado como entregue automaticamente. Algum problema? Fale com a loja.</p>
                )}
                {order.status === "delivered" && order.customerConfirmedAt && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Você confirmou o recebimento às {formatTimeSP(order.customerConfirmedAt)}. Obrigado!
                  </p>
                )}
                {!finished && <p className="mt-3 text-xs text-muted-foreground">Esta página se atualiza sozinha.</p>}
              </div>
            )}
          </section>

          {/* Ações: falar com a loja / onde retirar */}
          {(whats || map || (isDelivery && order.deliveryAddress)) && (
            <section className="space-y-3 rounded-3xl border bg-card p-5 shadow-sm">
              {isDelivery ? (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold">Entrega em</p>
                    <p className="text-sm text-muted-foreground">{fullAddress(order)}</p>
                  </div>
                </div>
              ) : (
                store.address && (
                  <div className="flex items-start gap-3">
                    <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{order.type === "dine_in" ? "Onde fica a loja" : "Retirar em"}</p>
                      <p className="text-sm text-muted-foreground">{store.address}</p>
                    </div>
                  </div>
                )
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {whats && (
                  <Button asChild size="lg" className="h-12 rounded-full bg-[#177a40] sm:flex-1 text-white hover:bg-[#12663a]">
                    <a href={whats} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-5 w-5" aria-hidden />
                      Falar com a loja
                    </a>
                  </Button>
                )}
                {map && (
                  <Button asChild size="lg" variant="outline" className="h-12 rounded-full sm:flex-1">
                    <a href={map} target="_blank" rel="noopener noreferrer">
                      <MapPin className="h-5 w-5" aria-hidden />
                      Ver no mapa
                    </a>
                  </Button>
                )}
              </div>
            </section>
          )}

          {/* Itens */}
          <section className="rounded-3xl border bg-card p-5 shadow-sm" aria-labelledby="itens-titulo">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="itens-titulo" className="text-lg font-bold">
                Itens
              </h2>
              <p className="text-xs text-muted-foreground">{formatDateTimeSP(order.createdAt)}</p>
            </div>
            <ul className="divide-y">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="text-primary">{item.quantity}x</span> {item.name}
                    </p>
                    {item.extras.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        + {item.extras.map((e) => (e.quantity > 1 ? `${e.quantity}x ${e.name}` : e.name)).join(", ")}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{formatBRL(lineTotal(item))}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t pt-3 text-sm">
              {order.deliveryFee > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatBRL(order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Entrega</span>
                    <span className="tabular-nums">{formatBRL(order.deliveryFee)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between pt-1 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatBRL(order.total)}</span>
              </div>
              <p className="text-muted-foreground">
                {TYPE_LABEL[order.type]} · {PAYMENT_LABEL[order.paymentMethod]} · pagamento direto com a loja
              </p>
              {changeText(order) && <p className="font-medium">{changeText(order)}</p>}
              {order.notes && <p className="pt-1 text-muted-foreground">Obs.: {order.notes}</p>}
            </div>
          </section>

          <div className="pt-2 text-center">
            <Button asChild variant="outline" className="h-11 rounded-full px-6">
              <Link href={`/loja/${store.slug}`}>Fazer outro pedido</Link>
            </Button>
          </div>
        </div>
      </main>

      <StoreFooter store={store} />
    </div>
  )
}
