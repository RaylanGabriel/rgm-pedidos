import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Clock, FileSpreadsheet, MessageCircle, Minus, TrendingDown, Wallet } from "lucide-react"
import { formatPhone, whatsappLink } from "@/lib/links"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDateTimeSP } from "@/lib/dates"
import {
  formatBRL,
  PAYMENT_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  type OrderWithItemsView,
} from "@/lib/order-shared"
import { presets } from "@/lib/report-range"
import { rangeDays, type Report } from "@/lib/reports"

const pct = (v: number) => `${Math.round(v * 100)}%`

/** "2026-11-07" → "sex 07/11" (datas sem fuso: meio-dia UTC evita virar o dia). */
const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" })
const monthFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short", year: "2-digit" })
const longFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
const asDate = (ymd: string) => new Date(`${ymd.length === 7 ? `${ymd}-01` : ymd}T12:00:00Z`)
const dayLabel = (key: string) => dayFmt.format(asDate(key)).replace(".", "").replace(",", "")
const seriesLabel = (key: string) => (key.length === 7 ? monthFmt.format(asDate(key)).replace(".", "") : dayLabel(key))

/** Relatório do período (componente de servidor: filtros são links/formulário GET). */
export function ReportsView({
  storeName,
  promisedMinutes,
  report,
  orders,
  de,
  ate,
  clamped,
  page,
  pageSize,
}: {
  storeName: string
  /** Tempo de preparo que a loja promete ao cliente (configurações) */
  promisedMinutes: number
  report: Report
  orders: OrderWithItemsView[]
  de: string
  ate: string
  clamped: boolean
  page: number
  pageSize: number
}) {
  const { current: cur, previous: prev } = report
  const avg = cur.orders ? cur.revenue / cur.orders : 0
  const prevAvg = prev.orders ? prev.revenue / prev.orders : 0
  const allOrders = cur.orders + cur.cancelled
  const days = rangeDays(de, ate)
  const periodText = de === ate ? longFmt.format(asDate(de)) : `${longFmt.format(asDate(de))} a ${longFmt.format(asDate(ate))}`
  const compareText = days === 1 ? "vs. dia anterior" : `vs. ${days} dias anteriores`
  const qs = (extra: Record<string, string | number> = {}) =>
    new URLSearchParams({ de, ate, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) }).toString()

  return (
    <div className="space-y-6">
      {/* Cabeçalho + exportar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">Relatórios</h1>
          <p className="text-muted-foreground">
            {storeName} · {periodText}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/admin/relatorios/caixa?dia=${ate}`}>
              <Wallet className="mr-2 h-4 w-4" aria-hidden />
              Fechamento de caixa
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/admin/relatorios/exportar?${qs()}`} download>
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />
              Baixar planilha (Excel)
            </a>
          </Button>
        </div>
      </div>

      <PeriodPicker de={de} ate={ate} clamped={clamped} />

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
        <Stat
          title="Faturamento"
          value={formatBRL(cur.revenue)}
          delta={<Delta now={cur.revenue} before={prev.revenue} label={compareText} />}
          note={cur.deliveryFees > 0 ? `inclui ${formatBRL(cur.deliveryFees)} de entrega` : undefined}
        />
        <Stat title="Pedidos" value={String(cur.orders)} delta={<Delta now={cur.orders} before={prev.orders} label={compareText} />} />
        <Stat title="Ticket médio" value={formatBRL(avg)} delta={<Delta now={avg} before={prevAvg} label={compareText} />} />
        <Stat
          title="Cancelados"
          value={String(cur.cancelled)}
          delta={<Delta now={cur.cancelled} before={prev.cancelled} label={compareText} invert />}
          note={cur.cancelled ? `${formatBRL(cur.cancelledTotal)} · ${pct(cur.cancelled / allOrders)} dos pedidos` : undefined}
        />
      </div>

      {cur.orders === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-semibold">Nenhuma venda neste período.</p>
            <p className="mt-1 text-sm text-muted-foreground">Escolha outro período acima ou compartilhe o link do cardápio com seus clientes.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SalesChart report={report} />

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <TopItems items={report.topItems} extras={report.topExtras} />
              <SlowItems items={report.slowItems} days={days} soldOrders={cur.orders} />
            </div>
            <div className="space-y-6">
              <PeakHours hours={report.byHour} />
              <Breakdown
                title="Formas de pagamento"
                description="Para conferir o caixa"
                rows={report.byPayment.map((p) => ({ label: PAYMENT_LABEL[p.method], orders: p.orders, value: p.revenue }))}
                total={cur.revenue}
              />
              <Breakdown
                title="Tipo de pedido"
                rows={report.byType.map((t) => ({ label: TYPE_LABEL[t.type], orders: t.orders, value: t.revenue }))}
                total={cur.revenue}
              />
              {report.byZone.length > 0 && (
                <Breakdown
                  title="Entregas por bairro"
                  description="Quantidade de entregas e taxas cobradas"
                  rows={report.byZone.map((z) => ({ label: z.zone, orders: z.orders, value: z.fees }))}
                  total={report.byZone.reduce((s, z) => s + z.orders, 0)}
                  byOrders
                />
              )}
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Times times={report.times} promised={promisedMinutes} />
            <TopCustomers customers={report.customers} storeName={storeName} />
          </div>
        </>
      )}

      <History orders={orders} total={allOrders} page={page} pageSize={pageSize} qs={qs} />
    </div>
  )
}

// ---------- Período ----------
function PeriodPicker({ de, ate, clamped }: { de: string; ate: string; clamped: boolean }) {
  const list = presets()
  const custom = !list.some((p) => p.de === de && p.ate === ate)
  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <nav aria-label="Atalhos de período" className="flex flex-wrap gap-2">
          {list.map((p) => {
            const active = p.de === de && p.ate === ate
            return (
              <Link
                key={p.label}
                href={`/admin/relatorios?de=${p.de}&ate=${p.ate}`}
                aria-current={active ? "true" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary hover:text-primary"
                }`}
              >
                {p.label}
              </Link>
            )
          })}
        </nav>
        <form method="get" className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto] sm:max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="de" className="text-xs text-muted-foreground">
              De
            </Label>
            <Input id="de" name="de" type="date" defaultValue={de} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ate" className="text-xs text-muted-foreground">
              Até
            </Label>
            <Input id="ate" name="ate" type="date" defaultValue={ate} />
          </div>
          <Button type="submit" variant={custom ? "default" : "secondary"} className="col-span-2 sm:col-span-1">
            Ver período
          </Button>
        </form>
        {clamped && <p className="text-xs text-destructive">O período máximo é de 1 ano: ajustamos a data inicial.</p>}
      </CardContent>
    </Card>
  )
}

// ---------- Indicadores ----------
function Stat({ title, value, delta, note }: { title: string; value: string; delta: React.ReactNode; note?: string }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
        {delta}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

/** Variação contra o período anterior: seta + texto (nunca só cor). invert = subir é ruim. */
function Delta({ now, before, label, invert = false }: { now: number; before: number; label: string; invert?: boolean }) {
  if (before === 0) {
    return <p className="text-xs text-muted-foreground">{now === 0 ? "—" : `sem dados ${label.replace("vs. ", "nos ")}`}</p>
  }
  const change = (now - before) / before
  const flat = Math.abs(change) < 0.005
  const good = invert ? change < 0 : change > 0
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight
  const tone = flat ? "text-muted-foreground" : good ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
  return (
    <p className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {flat ? "igual" : `${change > 0 ? "+" : "−"}${pct(Math.abs(change))}`} <span className="font-normal text-muted-foreground">{label}</span>
      </span>
    </p>
  )
}

// ---------- Gráfico de vendas ----------
/** Teto "redondo" para o eixo (ex.: 437 → 500). */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v) ?? 10) * p
}
const compactBRL = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`

function SalesChart({ report }: { report: Report }) {
  const s = report.series
  const max = niceMax(Math.max(...s.map((d) => d.revenue)))
  const best = s.reduce((a, b) => (b.revenue > a.revenue ? b : a), s[0])
  const unit = report.granularity === "day" ? "dia" : "mês"
  const every = Math.ceil(s.length / 8) // no máximo ~8 rótulos no eixo

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faturamento por {unit}</CardTitle>
        <CardDescription>
          Melhor {unit}: <strong className="text-foreground">{seriesLabel(best.key)}</strong> com {formatBRL(best.revenue)} ({best.orders}{" "}
          {best.orders === 1 ? "pedido" : "pedidos"})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {/* eixo Y */}
          <div className="flex h-48 flex-col justify-between py-0 text-right text-[11px] tabular-nums text-muted-foreground" aria-hidden>
            <span className="-translate-y-1/2">{compactBRL(max)}</span>
            <span>{compactBRL(max / 2)}</span>
            <span className="translate-y-1/2">R$ 0</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-48">
              {/* grade recessiva */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
                <div className="border-t border-dashed border-border" />
                <div className="border-t border-dashed border-border" />
                <div className="border-t border-border" />
              </div>
              <ul className="relative flex h-full items-end gap-[2px]" aria-label={`Faturamento por ${unit}`}>
                {s.map((d, i) => {
                  const h = (d.revenue / max) * 100
                  const edge = i < 2 ? "left-0" : i > s.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2"
                  return (
                    <li
                      key={d.key}
                      tabIndex={0}
                      aria-label={`${seriesLabel(d.key)}: ${formatBRL(d.revenue)}, ${d.orders} pedidos`}
                      className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                    >
                      <div
                        className="w-full max-w-14 rounded-t-[4px] bg-primary/85 transition-colors group-hover:bg-primary group-focus-visible:bg-primary"
                        style={{ height: d.revenue > 0 ? `max(${h}%, 3px)` : 0 }}
                      />
                      <div
                        className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${edge}`}
                        style={{ bottom: `calc(${h}% + 6px)` }}
                        role="presentation"
                      >
                        <p className="font-semibold capitalize">{seriesLabel(d.key)}</p>
                        <p className="tabular-nums">{formatBRL(d.revenue)}</p>
                        <p className="text-muted-foreground">
                          {d.orders} {d.orders === 1 ? "pedido" : "pedidos"}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            {/* eixo X */}
            <div className="mt-2 flex gap-[2px] text-[11px] text-muted-foreground" aria-hidden>
              {s.map((d, i) => (
                <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                  {i % every !== 0 ? null : report.granularity === "day" ? (
                    <>
                      {/* dia da semana só com espaço (poucos dias, tela larga) */}
                      {s.length <= 14 && <span className="hidden sm:inline">{dayLabel(d.key).split(" ")[0]} </span>}
                      {`${d.key.slice(8, 10)}/${d.key.slice(5, 7)}`}
                    </>
                  ) : (
                    seriesLabel(d.key)
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Horário de pico ----------
function PeakHours({ hours }: { hours: Report["byHour"] }) {
  if (hours.length === 0) return null
  const first = hours[0].hour
  const last = hours[hours.length - 1].hour
  const map = new Map(hours.map((h) => [h.hour, h.orders]))
  const list = Array.from({ length: last - first + 1 }, (_, i) => ({ hour: first + i, orders: map.get(first + i) ?? 0 }))
  const max = Math.max(...list.map((h) => h.orders))
  const peak = list.find((h) => h.orders === max)!

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horário de pico</CardTitle>
        <CardDescription>
          Mais pedidos entre <strong className="text-foreground">{peak.hour}h e {peak.hour + 1}h</strong> — bom horário para reforçar a equipe
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex h-24 items-end gap-[2px]" aria-label="Pedidos por hora">
          {list.map((h) => (
            <li
              key={h.hour}
              tabIndex={0}
              title={`${h.hour}h: ${h.orders} ${h.orders === 1 ? "pedido" : "pedidos"}`}
              aria-label={`${h.hour}h: ${h.orders} pedidos`}
              className="group flex h-full min-w-0 flex-1 items-end outline-none"
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${h === peak ? "bg-primary" : "bg-primary/40 group-hover:bg-primary/70"}`}
                style={{ height: h.orders ? `max(${(h.orders / max) * 100}%, 3px)` : 0 }}
              />
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex gap-[2px] text-[11px] tabular-nums text-muted-foreground" aria-hidden>
          {list.map((h, i) => (
            <span key={h.hour} className="min-w-0 flex-1 text-center">
              {list.length <= 12 || i % 2 === 0 ? `${h.hour}h` : ""}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Quebras (pagamento, tipo, bairro) ----------
function Breakdown({
  title,
  description,
  rows,
  total,
  byOrders = false,
}: {
  title: string
  description?: string
  rows: { label: string; orders: number; value: number }[]
  total: number
  /** proporção pela quantidade de pedidos (bairros) em vez do valor */
  byOrders?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {rows.map((r) => {
            const share = total ? (byOrders ? r.orders : r.value) / total : 0
            return (
              <li key={r.label}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="min-w-0 font-medium">{r.label}</span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    <strong>{formatBRL(r.value)}</strong>
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.orders} {r.orders === 1 ? (byOrders ? "entrega" : "pedido") : byOrders ? "entregas" : "pedidos"} · {pct(share)}
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------- Mais vendidos ----------
function TopItems({ items, extras }: { items: Report["topItems"]; extras: Report["topExtras"] }) {
  const max = items[0]?.qty ?? 1
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mais vendidos</CardTitle>
        <CardDescription>Top 10 do período, com o faturamento de cada item (já com adicionais)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="space-y-3">
          {items.map((it, i) => (
            <li key={it.name} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{it.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <strong className="text-foreground">{it.qty}</strong> un · {formatBRL(it.revenue)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(it.qty / max) * 100}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>

        {extras.length > 0 && (
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-semibold">Adicionais mais pedidos</p>
            <ul className="divide-y text-sm">
              {extras.map((e) => (
                <li key={e.name} className="flex justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {e.qty} un · {formatBRL(e.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Itens com pouca saída ----------
function SlowItems({ items, days, soldOrders }: { items: Report["slowItems"]; days: number; soldOrders: number }) {
  // Com pouco tempo ou poucos pedidos, "vendeu pouco" é só acaso
  const enough = days >= 7 && soldOrders >= 10
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-muted-foreground" aria-hidden />
          Pouca saída
        </CardTitle>
        <CardDescription>Itens do cardápio que menos venderam no período</CardDescription>
      </CardHeader>
      <CardContent>
        {!enough ? (
          <p className="text-sm text-muted-foreground">
            Escolha um período de pelo menos 7 dias (com 10 pedidos ou mais) para ver quais itens estão vendendo pouco.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todos os itens do cardápio estão vendendo bem neste período. 👏</p>
        ) : (
          <>
            <ul className="divide-y text-sm">
              {items.map((it) => (
                <li key={it.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{it.name}</span>
                    <span className="text-muted-foreground"> · {formatBRL(it.price)}</span>
                    {!it.available && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">esgotado</span>}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      it.qty === 0 ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : "bg-muted"
                    }`}
                  >
                    {it.qty === 0 ? "nenhuma venda" : `${it.qty} ${it.qty === 1 ? "venda" : "vendas"}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Dica:</strong> faça uma promoção, coloque em ⭐ Mais pedidos ou monte um combo. Se continuar
              parado, vale tirar do cardápio — menos opções deixam a escolha mais rápida.
            </p>
            <Link href="/admin/cardapio" className="mt-2 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">
              Abrir cardápio →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Tempos ----------
const fmtMin = (m: number | null) => {
  if (m === null) return "—"
  const r = Math.round(m)
  return r >= 60 ? `${Math.floor(r / 60)}h${String(r % 60).padStart(2, "0")}` : `${r} min`
}

function Times({ times, promised }: { times: Report["times"]; promised: number }) {
  const late = times.prep !== null && times.prep > promised + 2
  const rows = [
    { label: "Até ficar pronto", value: times.prep, n: times.prepN, hint: `você informa ${promised} min ao cliente` },
    { label: "Entrega (saiu → entregue)", value: times.ride, n: times.rideN, hint: "tempo do entregador" },
    { label: "Entrega: do pedido até o cliente", value: times.deliveryTotal, n: times.deliveryTotalN, hint: "o que o cliente sente" },
    { label: "Retirada/local: do pedido até entregar", value: times.pickupTotal, n: times.pickupTotalN, hint: "no balcão" },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" aria-hidden />
          Tempo médio
        </CardTitle>
        <CardDescription>Calculado pelos horários marcados no painel da cozinha</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          {rows.map((r) => (
            <div key={r.label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{r.label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{fmtMin(r.value)}</dd>
              <dd className="text-[11px] text-muted-foreground">
                {r.n ? `${r.hint} · ${r.n} ${r.n === 1 ? "pedido" : "pedidos"}` : "sem dados ainda"}
              </dd>
            </div>
          ))}
        </dl>
        {late && (
          <p role="status" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            O preparo está levando em média <strong>{fmtMin(times.prep)}</strong>, mais que os {promised} min avisados ao cliente. Ajuste o tempo em{" "}
            <Link href="/admin/configuracoes" className="font-semibold underline underline-offset-2">
              Configurações
            </Link>{" "}
            para não gerar reclamação.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Só conta pedidos em que a cozinha tocou nos botões (Pronto, Saiu, Entregue). Entregas fechadas sozinhas depois de 1h ficam de fora.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------- Melhores clientes ----------
function TopCustomers({ customers, storeName }: { customers: Report["customers"]; storeName: string }) {
  const { unique, returning, top } = customers
  return (
    <Card>
      <CardHeader>
        <CardTitle>Melhores clientes</CardTitle>
        <CardDescription>
          {unique === 0
            ? "Pelo telefone informado no pedido"
            : `${unique} ${unique === 1 ? "cliente" : "clientes"} com telefone · ${returning} ${returning === 1 ? "voltou" : "voltaram"} a pedir (${pct(returning / unique)})`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido com telefone no período.</p>
        ) : (
          <>
            <ol className="divide-y">
              {top.map((c, i) => {
                const first = c.name.split(" ")[0]
                const wa = whatsappLink(c.phone, `Oi, ${first}! Aqui é do ${storeName}. `)
                return (
                  <li key={c.phone} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatPhone(c.phone)} · {c.orders} {c.orders === 1 ? "pedido" : "pedidos"} · {formatBRL(c.revenue)}
                      </p>
                    </div>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Chamar ${c.name} no WhatsApp`}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold text-[#177a40] hover:bg-muted dark:text-green-400"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    )}
                  </li>
                )
              })}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Ideia: mande um cupom para quem mais pede ou para quem sumiu. A lista completa está na planilha (aba Clientes).</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Histórico ----------
const STATUS_TONE: Record<string, string> = {
  delivered: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  cancelled: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
}

function History({
  orders,
  total,
  page,
  pageSize,
  qs,
}: {
  orders: OrderWithItemsView[]
  total: number
  page: number
  pageSize: number
  qs: (extra?: Record<string, string | number>) => string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  return (
    <Card id="historico">
      <CardHeader>
        <CardTitle>Pedidos do período</CardTitle>
        <CardDescription>
          {total === 0
            ? "Nenhum pedido"
            : `${total} ${total === 1 ? "pedido" : "pedidos"} (incluindo cancelados)${pages > 1 ? ` · mostrando ${from}–${Math.min(total, from + orders.length - 1)}` : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">{total ? "Página vazia." : "Nenhum pedido encontrado."}</p>
        ) : (
          <ul className="divide-y">
            {orders.map((o) => {
              const cancelled = o.status === "cancelled"
              return (
                <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3">
                  <p className="min-w-0 truncate font-semibold">
                    #{o.orderNumber} · {o.customerName}
                  </p>
                  <p className={`text-right font-bold tabular-nums ${cancelled ? "text-muted-foreground line-through" : ""}`}>{formatBRL(o.total)}</p>
                  <p className="min-w-0 truncate text-sm text-muted-foreground">{o.items.map((i) => `${i.quantity}x ${i.name}`).join(" · ")}</p>
                  <p className="text-right text-xs text-muted-foreground tabular-nums">{formatDateTimeSP(o.createdAt)}</p>
                  <div className="col-span-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[o.status] ?? "bg-muted text-foreground"}`}>{STATUS_LABEL[o.status]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{TYPE_LABEL[o.type]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{PAYMENT_LABEL[o.paymentMethod]}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-2 border-t pt-4">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/relatorios?${qs({ pagina: page - 1 })}#historico`}>← Mais recentes</Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted-foreground">
              Página {page} de {pages}
            </span>
            {page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/relatorios?${qs({ pagina: page + 1 })}#historico`}>Mais antigos →</Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        )}
      </CardContent>
    </Card>
  )
}
