"use client"

import { Minus, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CartLine } from "@/lib/cart"
import { formatBRL, lineTotal } from "@/lib/order-shared"

export function cartTotal(lines: CartLine[]) {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
}

/** Lista do carrinho com ajuste de quantidade. Sem `onQuantity/onRemove` vira só leitura. */
export function CartSummary({
  lines,
  onQuantity,
  onRemove,
  deliveryFee,
}: {
  lines: CartLine[]
  onQuantity?: (index: number, quantity: number) => void
  onRemove?: (index: number) => void
  /** Pedido de entrega: taxa prevista (null = falta escolher o bairro). Sem entrega: undefined. */
  deliveryFee?: number | null
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Seu carrinho está vazio.</p>
  }

  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <div key={index} className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">
                {!onQuantity && `${line.quantity}x `}
                {line.name}
              </p>
              {line.extras.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  + {line.extras.map((e) => (e.quantity > 1 ? `${e.quantity}x ${e.name}` : e.name)).join(", ")}
                </p>
              )}
            </div>
            {onRemove && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onRemove(index)} aria-label={`Remover ${line.name}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            {onQuantity ? (
              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => onQuantity(index, line.quantity - 1)} aria-label="Diminuir quantidade">
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="w-7 text-center text-sm font-medium">{line.quantity}</span>
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => onQuantity(index, line.quantity + 1)} aria-label="Aumentar quantidade">
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <span />
            )}
            <span className="font-bold">{formatBRL(lineTotal(line))}</span>
          </div>
        </div>
      ))}
      {deliveryFee !== undefined && (
        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(cartTotal(lines))}</span>
          </div>
          <div className="flex justify-between">
            <span>Entrega</span>
            <span>{deliveryFee === null ? "escolha o bairro" : deliveryFee > 0 ? formatBRL(deliveryFee) : "grátis"}</span>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center border-t pt-3 text-lg font-bold">
        <span>Total</span>
        <span className="text-primary">{formatBRL(cartTotal(lines) + (deliveryFee ?? 0))}</span>
      </div>
    </div>
  )
}
