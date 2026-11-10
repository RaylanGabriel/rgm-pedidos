"use client"

import { useEffect, useState } from "react"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/order-shared"

/** "12,50" / "12.50" / "R$ 12" → 12.5 (vazio = null) */
function parseMoney(v: string) {
  const clean = v.replace(/[^\d,.-]/g, "")
  if (!clean) return null
  const n = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean)
  return Number.isFinite(n) ? n : null
}

/**
 * Conferência da gaveta: fundo de troco + vendas em dinheiro = esperado; o dono digita o que contou.
 * O fundo de troco fica lembrado neste aparelho (é quase sempre o mesmo valor).
 */
export function CashDrawer({ cashSales, storeId }: { cashSales: number; storeId: string }) {
  const key = `caixa:fundo:${storeId}`
  const [fundo, setFundo] = useState("")
  const [contado, setContado] = useState("")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) setFundo(saved)
    } catch {}
  }, [key])

  const f = parseMoney(fundo) ?? 0
  const expected = f + cashSales
  const counted = parseMoney(contado)
  const diff = counted === null ? null : Math.round((counted - expected) * 100) / 100

  return (
    <section aria-labelledby="gaveta" className="space-y-2">
      <h2 id="gaveta" className="text-sm font-bold uppercase tracking-wide">
        Gaveta de dinheiro
      </h2>
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt>
            <label htmlFor="fundo">Fundo de troco (abertura)</label>
          </dt>
          <dd>
            <MoneyInput
              id="fundo"
              value={fundo}
              onChange={(v) => {
                setFundo(v)
                try {
                  localStorage.setItem(key, v)
                } catch {}
              }}
            />
          </dd>
        </div>
        <Row label="+ Vendas em dinheiro" value={formatBRL(cashSales)} />
        <Row label="= Esperado na gaveta" value={formatBRL(expected)} strong />
        <div className="flex items-center justify-between gap-3 border-t border-dashed pt-1.5">
          <dt>
            <label htmlFor="contado">Contado no fechamento</label>
          </dt>
          <dd>
            <MoneyInput id="contado" value={contado} onChange={setContado} placeholder="digite" />
          </dd>
        </div>
        {diff !== null && (
          <div
            role="status"
            className={`flex justify-between gap-3 rounded-md px-2 py-1.5 font-semibold ${
              diff === 0
                ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
                : "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
            } print:bg-transparent print:px-0`}
          >
            <dt>{diff === 0 ? "✓ Caixa batendo" : diff > 0 ? "Sobrando" : "Faltando"}</dt>
            <dd className="tabular-nums">{diff === 0 ? formatBRL(0) : formatBRL(Math.abs(diff))}</dd>
          </div>
        )}
      </dl>

      <Button type="button" size="lg" className="mt-4 w-full print:hidden" onClick={() => window.print()}>
        <Printer className="mr-2 h-5 w-5" aria-hidden />
        Imprimir fechamento
      </Button>
    </section>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function MoneyInput({ id, value, onChange, placeholder = "0,00" }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground print:text-foreground">R$</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-24 rounded-md border bg-background px-2 text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring print:h-auto print:w-20 print:border-0 print:bg-transparent print:p-0 print:placeholder:text-transparent"
      />
    </span>
  )
}
