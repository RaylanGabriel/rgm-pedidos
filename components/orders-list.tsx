"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bike, CheckCircle, ChefHat, Clock, Package, Phone, Printer, User, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { updateOrderStatusAction } from "@/app/admin/actions"
import { formatTimeSP, formatDateTimeSP } from "@/lib/dates"
import {
  formatBRL,
  fullAddress,
  lineTotal,
  NEXT_STATUS,
  PAYMENT_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  type OrderStatus,
  type OrderWithItemsView,
} from "@/lib/order-shared"

const STATUS_ICON: Record<OrderStatus, typeof Clock> = {
  pending: Package,
  preparing: ChefHat,
  ready: CheckCircle,
  delivered: Bike,
  cancelled: XCircle,
}

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  preparing: "Começar preparo",
  ready: "Marcar como pronto",
  delivered: "Entregue",
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

function printOrder(order: OrderWithItemsView, storeName: string) {
  const w = window.open("", "_blank", "width=260,height=500")
  if (!w) return
  const e = escapeHtml
  const items = order.items
    .map(
      (i) => `
      <div class="item">
        <div class="row"><strong>${i.quantity}x ${e(i.name)}</strong><span>${formatBRL(lineTotal(i))}</span></div>
        ${i.extras.map((x) => `<div class="extra">+ ${x.quantity}x ${e(x.name)}</div>`).join("")}
      </div>`,
    )
    .join("")

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido #${order.orderNumber}</title>
    <style>
      /* Impressora térmica 58mm (área útil ~48mm) */
      *{margin:0;padding:0;box-sizing:border-box}
      @page{size:58mm auto;margin:0}
      body{font-family:'Courier New','Lucida Console',monospace;width:48mm;padding:2mm;font-size:10px;line-height:1.25;color:#000;background:#fff}
      h1{font-size:12px;text-align:center} .num{font-size:20px;text-align:center;margin:1mm 0 2mm}
      .row{display:flex;justify-content:space-between;gap:2mm} .item{border-bottom:1px dashed #000;padding:1mm 0}
      .extra{padding-left:2mm;font-size:9px} .total{border-top:1px dashed #000;margin-top:2mm;padding-top:2mm;font-size:12px;font-weight:bold}
      .box{margin-top:2mm;padding:1mm;border:1px dashed #000;font-size:9px} p{margin:1px 0}
      @media print{body{padding:1mm}}
    </style></head><body>
    <h1>${e(storeName)}</h1>
    <div class="num"><strong>#${order.orderNumber}</strong></div>
    <p><strong>Cliente:</strong> ${e(order.customerName)}</p>
    ${order.customerPhone ? `<p><strong>Tel:</strong> ${e(order.customerPhone)}</p>` : ""}
    <p><strong>${TYPE_LABEL[order.type]}</strong> · ${PAYMENT_LABEL[order.paymentMethod]}</p>
    <p>${formatDateTimeSP(order.createdAt)}</p>
    ${order.type === "delivery" ? `<div class="box"><strong>Entrega:</strong><br>${e(fullAddress(order))}</div>` : ""}
    <div>${items}</div>
    ${order.deliveryFee > 0 ? `<div class="row" style="margin-top:2mm"><span>Taxa de entrega</span><span>${formatBRL(order.deliveryFee)}</span></div>` : ""}
    <div class="row total"><span>TOTAL</span><span>${formatBRL(order.total)}</span></div>
    ${order.notes ? `<div class="box"><strong>Obs.:</strong><br>${e(order.notes)}</div>` : ""}
    </body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

/** Bipe curto quando chega pedido novo (navegadores só tocam depois de alguma interação com a página). */
function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    osc.frequency.value = 880
    osc.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch {
    /* sem áudio: tudo bem */
  }
}

export function OrdersList({
  storeName,
  active,
  finished,
}: {
  storeName: string
  active: OrderWithItemsView[]
  finished: OrderWithItemsView[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Avisa quando aparece pedido que não estava na lista
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(active.map((o) => o.id))
    if (seen.current && [...ids].some((id) => !seen.current!.has(id))) beep()
    seen.current = ids
  }, [active])

  const changeStatus = (order: OrderWithItemsView, status: OrderStatus) => {
    if (status === "cancelled" && !confirm(`Cancelar o pedido #${order.orderNumber}?`)) return
    setBusyId(order.id)
    setError(null)
    startTransition(async () => {
      const res = await updateOrderStatusAction(order.id, status)
      if (!res.ok) setError(`Não foi possível atualizar o pedido #${order.orderNumber}.`)
      router.refresh()
      setBusyId(null)
    })
  }

  // Mais antigos primeiro na cozinha
  const queue = [...active].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <div className="space-y-10">
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive text-sm text-destructive">
          {error}
        </div>
      )}

      <section>
        <h2 className="text-2xl font-bold mb-4">Em andamento ({queue.length})</h2>
        {queue.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum pedido em andamento.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {queue.map((order) => {
              const Icon = STATUS_ICON[order.status]
              const next = NEXT_STATUS[order.status]
              const busy = pending && busyId === order.id
              return (
                <Card key={order.id} className={`border-2 ${order.status === "pending" ? "border-primary" : ""}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-2xl">#{order.orderNumber}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <User className="w-3 h-3" />
                          {order.customerName}
                        </CardDescription>
                        {order.customerPhone && (
                          <CardDescription className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {order.customerPhone}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={order.status === "pending" ? "default" : "secondary"}>
                          <Icon className="w-3 h-3" />
                          {STATUS_LABEL[order.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatTimeSP(order.createdAt)}</span>
                      </div>
                    </div>
                    <p className="text-xs font-medium">
                      {TYPE_LABEL[order.type]} · {PAYMENT_LABEL[order.paymentMethod]}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium">
                              {item.quantity}x {item.name}
                            </span>
                            <span className="text-muted-foreground">{formatBRL(lineTotal(item))}</span>
                          </div>
                          {item.extras.map((x) => (
                            <div key={x.id} className="pl-4 text-xs text-muted-foreground">
                              + {x.quantity}x {x.name}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    {order.type === "delivery" && <p className="text-xs border-t pt-2">Entrega: {fullAddress(order)}</p>}
                    {order.notes && <p className="text-xs border-t pt-2 font-medium">Obs.: {order.notes}</p>}

                    {order.deliveryFee > 0 && (
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span>Taxa de entrega</span>
                        <span>{formatBRL(order.deliveryFee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center border-t pt-2">
                      <span className="font-bold">Total</span>
                      <span className="text-lg font-bold text-primary">{formatBRL(order.total)}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" onClick={() => printOrder(order, storeName)} aria-label={`Imprimir pedido ${order.orderNumber}`}>
                        <Printer className="w-4 h-4" />
                      </Button>
                      {next && (
                        <Button className="flex-1" onClick={() => changeStatus(order, next)} disabled={busy}>
                          {busy ? "Atualizando…" : ACTION_LABEL[next]}
                        </Button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="w-full text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                      onClick={() => changeStatus(order, "cancelled")}
                      disabled={busy}
                    >
                      Cancelar pedido
                    </button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {finished.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4">Finalizados hoje ({finished.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {finished.map((order) => (
              <Card key={order.id} className="opacity-75">
                <CardContent className="py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      #{order.orderNumber} · {order.customerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_LABEL[order.status]}
                      {order.completedAt && ` às ${formatTimeSP(order.completedAt)}`} · {formatBRL(order.total)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => printOrder(order, storeName)} aria-label={`Imprimir pedido ${order.orderNumber}`}>
                    <Printer className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
