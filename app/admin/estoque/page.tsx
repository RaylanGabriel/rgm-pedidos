import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ActionButton } from "@/components/admin/form-ui"
import { Collapsible } from "@/components/admin/collapsible"
import { requireOwner } from "@/lib/auth/session"
import { formatDateTimeSP } from "@/lib/dates"
import { listMovements, listRecipes, listStockIngredients, MOVEMENT_LABEL, stockConsumption, type StockLevel } from "@/lib/stock"
import { untrackIngredientAction } from "./actions"
import { fmtQty } from "@/lib/stock-format"
import { MovementForm, RecipeQtyForm, TrackForm } from "./stock-forms"

export const metadata = { title: "Estoque" }

const TABS = { saldos: "Saldos", fichas: "Fichas", historico: "Histórico", consumo: "Consumo" } as const
type Tab = keyof typeof TABS

const LEVEL: Record<StockLevel, { text: string; cls: string }> = {
  ok: { text: "ok", cls: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
  low: { text: "acabando", cls: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" },
  out: { text: "acabou", cls: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
}

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ aba?: string; dias?: string }> }) {
  const { store } = await requireOwner()
  const sp = await searchParams
  const tab: Tab = sp.aba && sp.aba in TABS ? (sp.aba as Tab) : "saldos"
  const days = sp.dias === "30" ? 30 : 7

  const all = await listStockIngredients(store.id)
  const tracked = all.filter((i) => i.trackStock)
  // Base e adicional com o mesmo nome (ex.: Bacon): oferece só o adicional — um contador para a ficha e o "+ bacon"
  const extraNames = new Set(all.filter((i) => i.isExtra).map((i) => i.name.trim().toLowerCase()))
  const trackedNames = new Set(tracked.map((i) => i.name.trim().toLowerCase()))
  const untracked = all.filter(
    (i) => !i.trackStock && i.active && !trackedNames.has(i.name.trim().toLowerCase()) && (i.isExtra || !extraNames.has(i.name.trim().toLowerCase())),
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>

        <div>
          <h1 className="text-3xl font-bold">Estoque</h1>
          <p className="text-muted-foreground">
            Escolha os ingredientes que quer controlar. Cada pedido desconta sozinho quando entra na cozinha (Pix: quando o pagamento
            cai); pedido cancelado devolve. Quando um ingrediente acaba, os lanches que usam ele saem do cardápio até a próxima entrada.
          </p>
        </div>

        <nav className="-mb-px flex gap-1 overflow-x-auto border-b" aria-label="Seções do estoque">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link
              key={t}
              href={`?aba=${t}`}
              aria-current={tab === t ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TABS[t]}
            </Link>
          ))}
        </nav>

        {tab === "saldos" && (
          <div className="space-y-4">
            {tracked.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Nenhum ingrediente controlado ainda. Comece pelo que mais importa (pão, carne, bacon) logo abaixo.
                </CardContent>
              </Card>
            )}
            {tracked.map((i) => (
              <Card key={i.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{i.name}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL[i.level].cls}`}>{LEVEL[i.level].text}</span>
                      {i.isExtra && <span className="text-xs text-muted-foreground">adicional</span>}
                    </div>
                    <p className="text-2xl font-bold tabular-nums">
                      {fmtQty(i.stock)} <span className="text-base font-normal text-muted-foreground">{i.unit}</span>
                    </p>
                  </div>
                  {i.minStock !== null && (
                    <p className="text-xs text-muted-foreground">
                      Avisa abaixo de {fmtQty(i.minStock)} {i.unit}
                    </p>
                  )}
                  <MovementForm ingredientId={i.id} unit={i.unit} />
                  <div className="flex flex-wrap items-center gap-4">
                    <Collapsible summary="Unidade, mínimo e adicional">
                      <div className="mt-3">
                        <TrackForm current={{ id: i.id, name: i.name, isExtra: i.isExtra, unit: i.unit, minStock: i.minStock, extraAmount: i.extraAmount }} />
                      </div>
                    </Collapsible>
                    <ActionButton
                      action={untrackIngredientAction.bind(null, i.id)}
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      confirmText={`Parar de controlar "${i.name}"? O histórico fica, mas o saldo deixa de esgotar lanches.`}
                    >
                      Parar de controlar
                    </ActionButton>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="text-lg font-semibold">Controlar outro ingrediente</h2>
                <TrackForm options={untracked.map((u) => ({ id: u.id, name: u.name, isExtra: u.isExtra }))} />
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "fichas" && <Recipes storeId={store.id} tracked={tracked} />}
        {tab === "historico" && <History storeId={store.id} />}
        {tab === "consumo" && <Consumption storeId={store.id} days={days} />}
      </div>
    </div>
  )
}

async function Recipes({ storeId, tracked }: { storeId: string; tracked: { id: string; name: string; unit: string }[] }) {
  if (!tracked.length) {
    return <p className="text-sm text-muted-foreground">Primeiro escolha os ingredientes que quer controlar, na aba Saldos.</p>
  }
  const items = await listRecipes(storeId, tracked)
  const withIngredients = items.filter((it) => it.mine.length)
  const others = items.filter((it) => !it.mine.length)
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quanto 1 unidade de cada lanche gasta. Aparecem os ingredientes controlados que estão na descrição ou na ficha do lanche;
        para outro (ex.: o pão, se a descrição não fala dele), use &quot;+ Ingrediente&quot;. &quot;Sem cebola&quot; no pedido não desconta a
        cebola. Combo já desconta os lanches que inclui: na ficha dele, só o que é do combo (copo, embalagem).
      </p>
      {withIngredients.map((it) => (
        <Card key={it.id} className={it.active ? "" : "opacity-60"}>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-semibold">
              {it.name}
              {!it.active && <span className="ml-2 text-xs font-normal text-muted-foreground">(oculto)</span>}
            </h2>
            <RecipeQtyForm itemId={it.id} tracked={tracked} initial={it.mine} quantities={it.quantities} />
          </CardContent>
        </Card>
      ))}
      {others.length > 0 && (
        <Card>
          <CardContent className="space-y-1 pt-6">
            <h2 className="font-semibold">Outros itens do cardápio</h2>
            <p className="mb-2 text-sm text-muted-foreground">Não usam nenhum ingrediente controlado. Se algum usa, inclua por aqui.</p>
            {others.map((it) => (
              <div key={it.id} className={`border-t py-3 ${it.active ? "" : "opacity-60"}`}>
                <RecipeQtyForm itemId={it.id} itemName={it.name} tracked={tracked} initial={[]} quantities={it.quantities} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

async function History({ storeId }: { storeId: string }) {
  const rows = await listMovements(storeId)
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Quando</th>
              <th className="py-2 pr-3 font-medium">Ingrediente</th>
              <th className="py-2 pr-3 font-medium">O quê</th>
              <th className="py-2 pr-3 text-right font-medium">Quantidade</th>
              <th className="py-2 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="whitespace-nowrap py-2 pr-3">{formatDateTimeSP(r.createdAt.toISOString())}</td>
                <td className="py-2 pr-3">{r.ingredient}</td>
                <td className="py-2 pr-3">{MOVEMENT_LABEL[r.kind]}</td>
                <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${r.delta < 0 ? "text-destructive" : "text-green-700 dark:text-green-400"}`}>
                  {r.delta > 0 ? "+" : ""}
                  {fmtQty(r.delta)} {r.unit}
                </td>
                <td className="py-2 text-muted-foreground">
                  {[r.orderNumber ? `pedido #${r.orderNumber}` : null, r.note, r.userName].filter(Boolean).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

async function Consumption({ storeId, days }: { storeId: string; days: number }) {
  const rows = await stockConsumption(storeId, days)
  if (!rows.length) return <p className="text-sm text-muted-foreground">Primeiro escolha os ingredientes que quer controlar, na aba Saldos.</p>
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 30].map((d) => (
          <Button key={d} asChild size="sm" variant={d === days ? "default" : "outline"}>
            <Link href={`?aba=consumo&dias=${d}`}>Últimos {d} dias</Link>
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Ingrediente</th>
                <th className="py-2 pr-3 text-right font-medium">Gasto em {days} dias</th>
                <th className="py-2 pr-3 text-right font-medium">Média por dia</th>
                <th className="py-2 pr-3 text-right font-medium">Tem agora</th>
                <th className="py-2 text-right font-medium">Comprar para 7 dias</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fmtQty(r.consumed)} {r.unit}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fmtQty(Math.round(r.perDay * 10) / 10)} {r.unit}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fmtQty(r.stock)} {r.unit}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{r.buy > 0 ? `${fmtQty(Math.ceil(r.buy))} ${r.unit}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Comprar = média por dia × 7 + o mínimo de aviso − o que tem agora. Conta só o que saiu em pedidos (perdas não entram na média).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
