import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, ChefHat, Clock, Package, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AutoRefresh } from "@/components/auto-refresh"
import { StoreFooter, StoreHeader } from "@/components/store/store-header"
import { brandStyle } from "@/lib/color"
import { getOrderByToken } from "@/lib/orders"
import { formatBRL, fullAddress, lineTotal, PAYMENT_LABEL, STATUS_LABEL, TYPE_LABEL, type OrderStatus } from "@/lib/order-shared"

export const metadata = { title: "Acompanhar pedido", robots: { index: false } }

const STEPS: OrderStatus[] = ["pending", "preparing", "ready", "delivered"]
const STEP_ICON = { pending: Clock, preparing: ChefHat, ready: CheckCircle2, delivered: Package, cancelled: XCircle }

export default async function PedidoPage({ params }: { params: Promise<{ token: string }> }) {
  const data = await getOrderByToken((await params).token)
  if (!data) notFound()
  const { order, store } = data
  const finished = order.status === "delivered" || order.status === "cancelled"
  const currentStep = STEPS.indexOf(order.status)

  return (
    <div style={brandStyle(store.primaryColor)} className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted">
      {!finished && <AutoRefresh seconds={10} />}
      <StoreHeader store={store} />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Pedido</p>
            <h1 className="text-5xl font-bold">#{order.orderNumber}</h1>
            <p className="text-muted-foreground mt-1">{order.customerName}</p>
          </div>

          {/* Status */}
          <Card>
            <CardContent className="py-6">
              {order.status === "cancelled" ? (
                <div className="flex flex-col items-center gap-2 text-destructive" role="status">
                  <XCircle className="w-10 h-10" />
                  <p className="font-semibold text-lg">Pedido cancelado</p>
                  <p className="text-sm text-muted-foreground text-center">Em caso de dúvida, fale com a loja.</p>
                </div>
              ) : (
                <>
                  <ol className="grid grid-cols-4 gap-2" aria-label="Andamento do pedido">
                    {STEPS.map((step, i) => {
                      const Icon = STEP_ICON[step]
                      const done = i <= currentStep
                      return (
                        <li key={step} className="flex flex-col items-center gap-2 text-center" aria-current={i === currentStep ? "step" : undefined}>
                          <span
                            className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors ${
                              done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </span>
                          <span className={`text-xs ${i === currentStep ? "font-bold" : "text-muted-foreground"}`}>{STATUS_LABEL[step]}</span>
                        </li>
                      )
                    })}
                  </ol>
                  <p className="text-center mt-6 font-semibold" role="status">
                    {order.status === "pending" && `Pedido recebido! Tempo estimado: ~${order.estimatedWaitMinutes} min.`}
                    {order.status === "preparing" && "Seu pedido está sendo preparado."}
                    {order.status === "ready" &&
                      (order.type === "delivery" ? "Pedido pronto, saindo para entrega!" : "Pedido pronto! Pode retirar no balcão.")}
                    {order.status === "delivered" && "Pedido entregue. Bom apetite!"}
                  </p>
                  {!finished && <p className="text-center text-xs text-muted-foreground mt-1">Esta página se atualiza sozinha.</p>}
                </>
              )}
            </CardContent>
          </Card>

          {/* Itens */}
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
              <CardDescription>
                {TYPE_LABEL[order.type]} · {PAYMENT_LABEL[order.paymentMethod]} ·{" "}
                {new Date(order.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 border-b pb-3 last:border-0">
                  <div>
                    <p className="font-semibold">
                      {item.quantity}x {item.name}
                    </p>
                    {item.extras.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        + {item.extras.map((e) => (e.quantity > 1 ? `${e.quantity}x ${e.name}` : e.name)).join(", ")}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold shrink-0">{formatBRL(lineTotal(item))}</p>
                </div>
              ))}
              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Taxa de entrega</span>
                  <span>{formatBRL(order.deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2">
                <span>Total</span>
                <span className="text-primary">{formatBRL(order.total)}</span>
              </div>
              {order.type === "delivery" && <p className="text-sm text-muted-foreground">Entrega em: {fullAddress(order)}</p>}
              {order.notes && <p className="text-sm text-muted-foreground">Obs.: {order.notes}</p>}
            </CardContent>
          </Card>

          <div className="text-center">
            <Button asChild variant="outline">
              <Link href={`/loja/${store.slug}`}>Fazer outro pedido</Link>
            </Button>
          </div>
        </div>
      </main>

      <StoreFooter store={store} />
    </div>
  )
}
