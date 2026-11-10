"use client"

import { useMemo } from "react"
import { Plus } from "lucide-react"
import type { CartLine } from "@/lib/cart"
import type { MenuView } from "@/lib/orders"
import { formatBRL } from "@/lib/order-shared"

/**
 * "Para acompanhar": complementos baratos para adicionar com um toque.
 * Funciona para qualquer loja sem configuração: usa itens de categorias SEM adicionais (bebidas, porções,
 * sobremesas…), que dá para adicionar direto. Prioriza categorias que ainda não estão no carrinho.
 */
export function CartSuggestions({
  menu,
  lines,
  onAdd,
  max = 6,
}: {
  menu: MenuView
  lines: CartLine[]
  onAdd: (line: CartLine) => void
  max?: number
}) {
  const suggestions = useMemo(() => {
    const simpleCats = new Set(menu.categories.filter((c) => !c.extrasEnabled).map((c) => c.id))
    const inCart = new Set(lines.map((l) => l.menuItemId))
    const catOf = new Map(menu.items.map((i) => [i.id, i.categoryId]))
    const catsInCart = new Set(lines.map((l) => catOf.get(l.menuItemId)))
    return menu.items
      .filter((i) => i.available && i.categoryId && simpleCats.has(i.categoryId) && !inCart.has(i.id))
      .sort((a, b) => Number(catsInCart.has(a.categoryId)) - Number(catsInCart.has(b.categoryId)) || a.price - b.price)
      .slice(0, max)
  }, [menu, lines, max])

  if (lines.length === 0 || suggestions.length === 0) return null

  return (
    <section aria-labelledby="sugestoes-titulo" className="space-y-2">
      <h3 id="sugestoes-titulo" className="text-sm font-bold">
        Para acompanhar
      </h3>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((item) => (
          <li key={item.id} className="w-28 shrink-0">
            <button
              type="button"
              onClick={() => onAdd({ menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: 1, extras: [] })}
              className="group flex w-full flex-col overflow-hidden rounded-2xl border bg-card text-left transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Adicionar ${item.name}, ${formatBRL(item.price)}`}
            >
              <span className="relative block aspect-square w-full bg-muted">
                {item.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
                <span className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background transition group-hover:scale-110" aria-hidden>
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </span>
              </span>
              <span className="block px-2 pt-1.5 text-xs font-semibold leading-tight line-clamp-2">{item.name}</span>
              <span className="block px-2 pb-2 pt-0.5 text-xs font-bold text-primary">{formatBRL(item.price)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
