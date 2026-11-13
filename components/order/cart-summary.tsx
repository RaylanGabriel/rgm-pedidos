"use client"

import { useState } from "react"
import { Pencil, Trash2, UtensilsCrossed } from "lucide-react"
import { QuantityStepper } from "@/components/order/bottom-sheet"
import { isCustomizable, LineEditSheet } from "@/components/order/item-picker"
import type { CartLine } from "@/lib/cart"
import type { MenuView } from "@/lib/orders"
import { formatBRL, lineTotal, removalsText } from "@/lib/order-shared"

export function cartTotal(lines: CartLine[]) {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
}

/**
 * Lista do carrinho com ajuste de quantidade. Sem `onQuantity/onRemove` vira só leitura.
 * Com `menu` + `onReplace` + `onInsertAfter` (como no iFood): foto do lanche, ✏️ Editar (abre o lanche com as
 * escolhas da linha) e, em lanche com o que escolher ("sem ___"/adicionais), o "+" cria OUTRO lanche logo abaixo,
 * para personalizar cada um. Bebida e afins continuam somando a quantidade.
 */
export function CartSummary({
  lines,
  menu,
  onQuantity,
  onRemove,
  onReplace,
  onInsertAfter,
  deliveryFee,
  feePendingLabel = "escolha o bairro",
}: {
  lines: CartLine[]
  /** Cardápio: fotos e edição das linhas */
  menu?: MenuView
  onQuantity?: (index: number, quantity: number) => void
  onRemove?: (index: number) => void
  onReplace?: (index: number, line: CartLine) => void
  onInsertAfter?: (index: number, line: CartLine) => void
  /** Pedido de entrega: taxa prevista (null = falta escolher o bairro). Sem entrega: undefined. */
  deliveryFee?: number | null
  /** Texto quando a taxa ainda não é conhecida (padrão: "escolha o bairro") */
  feePendingLabel?: string
}) {
  const [editing, setEditing] = useState<number | null>(null)
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Seu carrinho está vazio.</p>
  }

  const imageOf = (id: string) => menu?.items.find((i) => i.id === id)?.imageUrl ?? null
  const canEdit = (l: CartLine) => !!menu && !!onReplace && isCustomizable(menu, l.menuItemId)
  const changeQty = (index: number, line: CartLine, q: number) => {
    // "+" num lanche com escolhas: outro lanche igual logo abaixo (1 un.), que dá para editar separado
    if (q > line.quantity && onInsertAfter && canEdit(line)) onInsertAfter(index, { ...line, quantity: 1 })
    else onQuantity?.(index, q)
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {lines.map((line, index) => (
          <li key={index} className="flex gap-3 py-3 first:pt-0">
            {menu && (
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {imageOf(line.menuItemId) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageOf(line.menuItemId)!} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <UtensilsCrossed className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" aria-hidden />
                )}
              </span>
            )}
            <div className="min-w-0 flex-1">
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
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {onQuantity && (
                    <QuantityStepper value={line.quantity} onChange={(q) => changeQty(index, line, q)} size="sm" label={`quantidade de ${line.name}`} />
                  )}
                  {canEdit(line) && (
                    <button
                      type="button"
                      onClick={() => setEditing(index)}
                      className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Editar ${line.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      Editar
                    </button>
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
            </div>
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
      {menu && onReplace && (
        <LineEditSheet
          menu={menu}
          line={editing !== null ? (lines[editing] ?? null) : null}
          onClose={() => setEditing(null)}
          onSave={(l) => {
            if (editing !== null) onReplace(editing, l)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
