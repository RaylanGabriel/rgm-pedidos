"use client"

import { Trash2 } from "lucide-react"
import { QuantityStepper } from "@/components/order/bottom-sheet"
import type { CartLine } from "@/lib/cart"
import { formatBRL, lineTotal, removalsText } from "@/lib/order-shared"

export function cartTotal(lines: CartLine[]) {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
}

/** Lista do carrinho com ajuste de quantidade. Sem `onQuantity/onRemove` vira só leitura. */
export function CartSummary({
  lines,
  onQuantity,
  onRemove,
  deliveryFee,
  feePendingLabel = "escolha o bairro",
}: {
  lines: CartLine[]
  onQuantity?: (index: number, quantity: number) => void
  onRemove?: (index: number) => void
  /** Pedido de entrega: taxa prevista (null = falta escolher o bairro). Sem entrega: undefined. */
  deliveryFee?: number | null
  /** Texto quando a taxa ainda não é conhecida (padrão: "escolha o bairro") */
  feePendingLabel?: string
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Seu carrinho está vazio.</p>
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {lines.map((line, index) => (
          <li key={index} className="py-3 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold leading-snug">
                  {!onQuantity && <span className="text-primary">{line.quantity}x </span>}
                  {line.name}
                </p>
                {line.extras.length > 0 && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    + {line.extras.map((e) => (e.quantity > 1 ? `${e.quantity}x ${e.name}` : e.name)).join(", ")}
                  </p>
                )}
                {line.removals.length > 0 && (
                  <p className="mt-0.5 text-sm font-semibold text-destructive">{removalsText(line.removals.map((r) => r.name))}</p>
                )}
              </div>
              <span className="shrink-0 font-bold tabular-nums">{formatBRL(lineTotal(line))}</span>
            </div>
            {(onQuantity || onRemove) && (
              <div className="mt-2 flex items-center gap-2">
                {onQuantity && (
                  <QuantityStepper value={line.quantity} onChange={(q) => onQuantity(index, q)} size="sm" label={`quantidade de ${line.name}`} />
                )}
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remover ${line.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Remover
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {deliveryFee !== undefined && (
        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(cartTotal(lines))}</span>
          </div>
          <div className="flex justify-between">
            <span>Entrega</span>
            <span>{deliveryFee === null ? feePendingLabel : deliveryFee > 0 ? formatBRL(deliveryFee) : "grátis"}</span>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center border-t pt-3 text-lg font-bold">
        <span>Total</span>
        <span className="tabular-nums">{formatBRL(cartTotal(lines) + (deliveryFee ?? 0))}</span>
      </div>
    </div>
  )
}
