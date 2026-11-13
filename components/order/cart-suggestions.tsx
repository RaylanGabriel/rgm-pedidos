"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import type { CartLine } from "@/lib/cart"
import type { MenuView } from "@/lib/orders"
import { formatBRL } from "@/lib/order-shared"

/**
 * "Para acompanhar": complementos baratos para adicionar com um toque, num carrossel.
 * Funciona para qualquer loja sem configuração: usa itens de categorias SEM adicionais (bebidas, porções,
 * sobremesas…), que dá para adicionar direto. Prioriza categorias que ainda não estão no carrinho.
 * Cards do mesmo tamanho (nome reserva 2 linhas); rolagem com encaixe; setas no computador quando há mais itens.
 */
export function CartSuggestions({
  menu,
  lines,
  onAdd,
  max = 10,
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

  // Setas: só aparecem quando dá para rolar naquele sentido
  const listRef = useRef<HTMLUListElement>(null)
  const [canScroll, setCanScroll] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }, [])
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(measure) // mede ao aparecer, ao mudar de tamanho e quando a lista muda
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, suggestions.length])
  const scrollBy = (dir: 1 | -1) => {
    const el = listRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" })
  }

  if (lines.length === 0 || suggestions.length === 0) return null

  const arrow =
    "hidden h-8 w-8 items-center justify-center rounded-full border bg-card text-foreground transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
  return (
    <section aria-labelledby="sugestoes-titulo" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="sugestoes-titulo" className="text-sm font-bold">
          Para acompanhar
        </h3>
        {(canScroll.left || canScroll.right) && (
          <div className="flex gap-1">
            <button type="button" onClick={() => scrollBy(-1)} disabled={!canScroll.left} aria-label="Ver sugestões anteriores" className={arrow}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={() => scrollBy(1)} disabled={!canScroll.right} aria-label="Ver mais sugestões" className={arrow}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      <ul
        ref={listRef}
        onScroll={measure}
        className="-mx-1 flex snap-x snap-mandatory scroll-px-1 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {suggestions.map((item) => (
          <li key={item.id} className="flex w-28 shrink-0 snap-start">
            <button
              type="button"
              onClick={() => onAdd({ menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: 1, extras: [], removals: [] })}
              className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              {/* Nome sempre com espaço de 2 linhas: todos os cards ficam da mesma altura e o preço alinhado */}
              <span className="block min-h-[calc(2.5em+0.375rem)] px-2 pt-1.5 text-xs font-semibold leading-tight line-clamp-2">{item.name}</span>
              <span className="mt-auto block px-2 pb-2 pt-0.5 text-xs font-bold text-primary">{formatBRL(item.price)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
