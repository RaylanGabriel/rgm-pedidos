import Link from "next/link"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requireOwner } from "@/lib/auth/session"
import { addDaysYmd, formatTimeSP, startOfDaySP, ymdSP } from "@/lib/dates"
import { ACTIVE_STATUSES, formatBRL, PAYMENT_LABEL, TYPE_LABEL, type PaymentMethod } from "@/lib/order-shared"
import { listOrders } from "@/lib/orders"
import { resolveRange } from "@/lib/report-range"
import { getReport } from "@/lib/reports"
import { CashDrawer } from "./cash-drawer"

export const metadata = { title: "Fechamento de caixa" }

const longDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const PAYMENTS: PaymentMethod[] = ["cash", "pix", "card_on_delivery"]

type SP = Promise<{ dia?: string }>

/** Resumo do dia para conferir e imprimir (cabe na impressora térmica e no A4). */
export default async function CaixaPage({ searchParams }: { searchParams: SP }) {
  const { store } = await requireOwner()
  const { dia: raw } = await searchParams
  const { ate: dia } = resolveRange(raw, raw) // valida a data (padrão: hoje)
  const today = ymdSP()

  const [report, orders] = await Promise.all([
    getReport(store.id, dia, dia),
    listOrders(store.id, { from: startOfDaySP(dia), to: startOfDaySP(addDaysYmd(dia, 1)), limit: 2000 }),
  ])
  const c = report.current
  const open = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).reverse()
  const cashOrders = orders.filter((o) => o.paymentMethod === "cash" && o.status !== "cancelled").reverse()
  const pay = new Map(report.byPayment.map((p) => [p.method, p]))
  const cashSales = pay.get("cash")?.revenue ?? 0

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <div className="mx-auto max-w-md px-4 py-6 print:max-w-none print:p-0">
        {/* Controles (não saem na impressão) */}
        <div className="mb-4 space-y-3 print:hidden">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={`/admin/relatorios?de=${dia}&ate=${dia}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Relatórios
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "Hoje", d: today },
              { label: "Ontem", d: addDaysYmd(today, -1) },
            ].map((p) => (
              <Link
                key={p.label}
                href={`/admin/relatorios/caixa?dia=${p.d}`}
                aria-current={p.d === dia ? "true" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  p.d === dia ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary"
                }`}
              >
                {p.label}
              </Link>
            ))}
            <form method="get" className="ml-auto flex items-center gap-2">
              <label htmlFor="dia" className="sr-only">
                Dia
              </label>
              <Input id="dia" name="dia" type="date" defaultValue={dia} max={today} className="h-9 w-40" />
              <Button type="submit" size="sm" variant="secondary">
                Ver
              </Button>
            </form>
          </div>
        </div>

        {/* Comprovante */}
        <article className="space-y-5 rounded-xl border bg-card p-5 text-card-foreground shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="border-b border-dashed pb-3 text-center">
            <p className="text-lg font-bold">{store.name}</p>
            <h1 className="text-sm font-semibold uppercase tracking-wide">Fechamento de caixa</h1>
            <p className="text-sm">{capitalize(longDay.format(new Date(`${dia}T12:00:00Z`)))}</p>
            <p className="text-xs text-muted-foreground print:text-foreground">Gerado às {formatTimeSP(new Date().toISOString())}</p>
          </header>

          {open.length > 0 && (
            <p role="alert" className="flex gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100 print:bg-transparent print:p-0">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <strong>
                  {open.length} {open.length === 1 ? "pedido ainda em andamento" : "pedidos ainda em andamento"}
                </strong>{" "}
                ({open.slice(0, 8).map((o) => `#${o.orderNumber}`).join(", ")}
                {open.length > 8 ? "…" : ""}). Eles já contam nos totais abaixo; finalize ou cancele antes de fechar.
              </span>
            </p>
          )}

          <section aria-labelledby="vendas" className="space-y-2">
            <h2 id="vendas" className="text-sm font-bold uppercase tracking-wide">
              Vendas
            </h2>
            <dl className="space-y-1.5 text-sm">
              <Line label="Pedidos" value={String(c.orders)} />
              <Line label="Ticket médio" value={formatBRL(c.orders ? c.revenue / c.orders : 0)} />
              {c.deliveryFees > 0 && <Line label="Taxas de entrega (incluídas)" value={formatBRL(c.deliveryFees)} />}
              <Line label={`Cancelados (${c.cancelled})`} value={formatBRL(c.cancelledTotal)} muted />
              <Line label="Total vendido" value={formatBRL(c.revenue)} big />
            </dl>
          </section>

          <section aria-labelledby="pagamento" className="space-y-2 border-t border-dashed pt-4">
            <h2 id="pagamento" className="text-sm font-bold uppercase tracking-wide">
              Por forma de pagamento
            </h2>
            <dl className="space-y-1.5 text-sm">
              {PAYMENTS.map((m) => {
                const p = pay.get(m)
                return <Line key={m} label={`${PAYMENT_LABEL[m]} (${p?.orders ?? 0})`} value={formatBRL(p?.revenue ?? 0)} />
              })}
            </dl>
            <p className="text-xs text-muted-foreground print:text-foreground">
              Confira o Pix no extrato do banco e o cartão na maquininha.
            </p>
          </section>

          <div className="border-t border-dashed pt-4">
            <CashDrawer cashSales={cashSales} storeId={store.id} />
          </div>

          {cashOrders.length > 0 && (
            <section aria-labelledby="dinheiro" className="space-y-2 border-t border-dashed pt-4">
              <h2 id="dinheiro" className="text-sm font-bold uppercase tracking-wide">
                Pedidos em dinheiro
              </h2>
              <ul className="space-y-1 text-sm tabular-nums">
                {cashOrders.map((o) => (
                  <li key={o.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      #{o.orderNumber} · {formatTimeSP(o.createdAt)} · {o.customerName}
                    </span>
                    <span className="shrink-0">{formatBRL(o.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.byType.length > 0 && (
            <section aria-labelledby="tipo" className="space-y-2 border-t border-dashed pt-4">
              <h2 id="tipo" className="text-sm font-bold uppercase tracking-wide">
                Por tipo
              </h2>
              <dl className="space-y-1.5 text-sm">
                {report.byType.map((t) => (
                  <Line key={t.type} label={`${TYPE_LABEL[t.type]} (${t.orders})`} value={formatBRL(t.revenue)} />
                ))}
              </dl>
            </section>
          )}

          <footer className="space-y-6 border-t border-dashed pt-6 text-sm">
            <p>Conferido por: ______________________________</p>
            <p>Assinatura: ________________________________</p>
          </footer>
        </article>
      </div>
    </div>
  )
}

function Line({ label, value, big, muted }: { label: string; value: string; big?: boolean; muted?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-3 ${big ? "border-t pt-1.5 text-base font-bold" : ""} ${muted ? "text-muted-foreground print:text-foreground" : ""}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
