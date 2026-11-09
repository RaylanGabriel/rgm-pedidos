import { Ban, DollarSign, ShoppingBag, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDateTimeSP } from "@/lib/dates"
import { formatBRL, STATUS_LABEL, type OrderWithItemsView } from "@/lib/order-shared"

/** Relatório do período (componente de servidor: o filtro é um formulário GET). */
export function ReportsView({
  orders,
  de,
  ate,
  truncated,
}: {
  orders: OrderWithItemsView[]
  de: string
  ate: string
  truncated: boolean
}) {
  const valid = orders.filter((o) => o.status !== "cancelled")
  const cancelled = orders.length - valid.length
  const revenue = valid.reduce((s, o) => s + o.total, 0)
  const avg = valid.length ? revenue / valid.length : 0

  const counts = new Map<string, number>()
  for (const o of valid) for (const i of o.items) counts.set(i.name, (counts.get(i.name) ?? 0) + i.quantity)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topMax = top[0]?.[1] ?? 1

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="de">De</Label>
              <Input id="de" name="de" type="date" defaultValue={de} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={ate} />
            </div>
            <Button type="submit">Aplicar</Button>
          </form>
          {truncated && <p className="text-xs text-destructive mt-3">Período muito grande: mostrando só os 5.000 pedidos mais recentes.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Pedidos" icon={ShoppingBag} value={String(valid.length)} note="sem contar cancelados" />
        <Stat title="Faturamento" icon={DollarSign} value={formatBRL(revenue)} note="no período" />
        <Stat title="Ticket médio" icon={TrendingUp} value={formatBRL(avg)} note="por pedido" />
        <Stat title="Cancelados" icon={Ban} value={String(cancelled)} note={orders.length ? `${Math.round((cancelled / orders.length) * 100)}% do total` : "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mais vendidos</CardTitle>
          <CardDescription>Top 5 do período (unidades)</CardDescription>
        </CardHeader>
        <CardContent>
          {top.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma venda no período.</p>
          ) : (
            <ol className="space-y-4">
              {top.map(([name, count], i) => (
                <li key={name} className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{name}</p>
                    <p className="text-sm text-muted-foreground">
                      {count} {count === 1 ? "unidade" : "unidades"}
                    </p>
                  </div>
                  <div className="w-24 sm:w-32 bg-muted rounded-full h-2 overflow-hidden" aria-hidden>
                    <div className="h-full bg-primary" style={{ width: `${(count / topMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"} no período
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum pedido encontrado.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className={`p-4 rounded-lg border bg-card ${o.status === "cancelled" ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-4 mb-1">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        #{o.orderNumber} · {o.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">{STATUS_LABEL[o.status]}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold ${o.status === "cancelled" ? "line-through" : "text-primary"}`}>{formatBRL(o.total)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTimeSP(o.createdAt)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{o.items.map((i) => `${i.quantity}x ${i.name}`).join(" · ")}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ title, icon: Icon, value, note }: { title: string; icon: typeof ShoppingBag; value: string; note: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{note}</p>
      </CardContent>
    </Card>
  )
}
