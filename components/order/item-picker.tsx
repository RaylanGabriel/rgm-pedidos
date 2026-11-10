"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Menu, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BottomSheet, QuantityStepper } from "@/components/order/bottom-sheet"
import type { CartExtra, CartLine } from "@/lib/cart"
import type { MenuItemView, MenuView } from "@/lib/orders"
import { formatBRL } from "@/lib/order-shared"
import { cn } from "@/lib/utils"

type Section = { id: string; name: string; items: MenuItemView[] }

/**
 * Cardápio: abas de categoria fixas no topo, cards com foto e "+", e a janela do item (adicionais + quantidade).
 * Usado no cardápio público e no "Novo pedido" do painel.
 */
export function ItemPicker({
  menu,
  onAdd,
  disabled,
  navTop = "top-0",
}: {
  menu: MenuView
  onAdd: (line: CartLine) => void
  disabled?: boolean
  /** Distância do topo para as abas fixas (classe Tailwind) */
  navTop?: string
}) {
  const [selected, setSelected] = useState<MenuItemView | null>(null)

  // Seções por categoria: itens da categoria principal + os que também foram colocados nela ("Mais vendidos"…).
  // Categorias vazias não aparecem; itens sem categoria vão para "Outros".
  const sections = useMemo<Section[]>(() => {
    const known = new Set(menu.categories.map((c) => c.id))
    const byId = new Map(menu.items.map((i) => [i.id, i]))
    const named = menu.categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: [
          ...menu.items.filter((i) => i.categoryId === c.id),
          // os "também mostrados aqui", na ordem escolhida pelo dono
          ...(menu.extraOrder[c.id] ?? []).map((id) => byId.get(id)).filter((i): i is MenuItemView => !!i && i.categoryId !== c.id),
        ],
      }))
      .filter((s) => s.items.length > 0)
    const orphans = menu.items.filter((i) => !i.categoryId || !known.has(i.categoryId))
    return orphans.length ? [...named, { id: "outros", name: named.length ? "Outros" : "Cardápio", items: orphans }] : named
  }, [menu])

  // Os adicionais seguem a categoria PRINCIPAL do item (a mesma regra do banco)
  const extrasFor = (item: MenuItemView) => menu.categories.find((c) => c.id === item.categoryId)?.extrasEnabled ?? true

  return (
    <div className="min-w-0">
      {sections.length > 1 && <CategoryNav sections={sections} top={navTop} />}

      <div className="space-y-8 pt-4">
        {sections.length === 0 && <p className="py-12 text-center text-muted-foreground">O cardápio ainda está vazio.</p>}
        {sections.map((section) => (
          <section key={section.id} id={`cat-${section.id}`} data-section={section.id} className="scroll-mt-20" aria-labelledby={`h-${section.id}`}>
            <h2 id={`h-${section.id}`} className="mb-3 text-xl font-bold tracking-tight">
              {section.name}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {section.items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  disabled={disabled}
                  onOpen={() => setSelected(item)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ItemSheet
        item={selected}
        ingredients={selected && extrasFor(selected) ? menu.ingredients : []}
        onClose={() => setSelected(null)}
        onAdd={(line) => {
          onAdd(line)
          setSelected(null)
        }}
      />
    </div>
  )
}

// ---------- Abas de categoria (fixas, com destaque da seção visível) ----------
const MENU_FROM = 5 // a partir de quantas categorias aparece o botão ☰

function CategoryNav({ sections, top }: { sections: Section[]; top: string }) {
  const [active, setActive] = useState<string | undefined>(sections[0]?.id)
  const [listOpen, setListOpen] = useState(false)
  const goTo = (id: string) => {
    setActive(id)
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const navRef = useRef<HTMLDivElement>(null)

  // Aba ativa = última seção cujo topo já passou da barra de abas
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const offset = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 24
      let current: string | undefined = sections[0]?.id
      for (const s of sections) {
        const el = document.getElementById(`cat-${s.id}`)
        if (el && el.getBoundingClientRect().top <= offset) current = s.id
      }
      // No fim da página, a última seção pode nunca chegar ao topo
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections.at(-1)?.id
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [sections])

  // Mantém a aba ativa visível na barra
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
  }, [active])

  return (
    <nav
      aria-label="Categorias do cardápio"
      className={cn("sticky z-30 -mx-4 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75", top)}
    >
      <div className="flex items-center gap-2">
      {sections.length >= MENU_FROM && (
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background text-foreground transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ver todas as categorias"
          aria-haspopup="dialog"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      )}
      <div ref={navRef} className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            data-tab={s.id}
            aria-current={active === s.id ? "true" : undefined}
            onClick={() => goTo(s.id)}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === s.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-foreground hover:bg-primary/10",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      </div>

      <BottomSheet open={listOpen} onOpenChange={setListOpen} title="Categorias">
        <ul className="px-3 pb-4">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setListOpen(false)
                  // espera a janela fechar para a rolagem não ser cancelada
                  setTimeout(() => goTo(s.id), 220)
                }}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active === s.id && "bg-primary/10 text-primary",
                )}
              >
                <span>{s.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {s.items.length} {s.items.length === 1 ? "item" : "itens"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </nav>
  )
}

// ---------- Card do item ----------
function MenuItemCard({ item, disabled, onOpen }: { item: MenuItemView; disabled?: boolean; onOpen: () => void }) {
  const soldOut = !item.available
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={soldOut || disabled}
      className="group flex w-full items-stretch gap-3 rounded-2xl border bg-card p-3 text-left shadow-xs transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      aria-label={`${item.name}, ${formatBRL(item.price)}${soldOut ? ", esgotado" : ""}`}
    >
      <div className={cn("flex min-w-0 flex-1 flex-col py-1", soldOut && "opacity-60")}>
        <h3 className="font-semibold leading-snug line-clamp-2">{item.name}</h3>
        {item.description && <p className="mt-1 text-sm leading-snug text-muted-foreground line-clamp-2">{item.description}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="text-base font-bold">{formatBRL(item.price)}</span>
          {soldOut && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Esgotado</span>}
        </div>
      </div>

      <div className="relative shrink-0">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn("h-28 w-28 rounded-xl bg-muted object-cover sm:h-32 sm:w-32", soldOut && "grayscale")}
          />
        ) : (
          <div className="h-full w-12" aria-hidden />
        )}
        {!soldOut && (
          <span
            className="absolute bottom-1.5 right-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background transition group-hover:scale-110"
            aria-hidden
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </span>
        )}
      </div>
    </button>
  )
}

// ---------- Janela do item ----------
function ItemSheet({
  item,
  ingredients,
  onClose,
  onAdd,
}: {
  item: MenuItemView | null
  ingredients: MenuView["ingredients"]
  onClose: () => void
  onAdd: (line: CartLine) => void
}) {
  const [extras, setExtras] = useState<CartExtra[]>([])
  const [qty, setQty] = useState(1)
  const [shown, setShown] = useState<MenuItemView | null>(item)

  // Guarda o último item para a animação de fechar não piscar vazia; zera escolhas ao abrir outro
  useEffect(() => {
    if (item) {
      setShown(item)
      setExtras([])
      setQty(1)
    }
  }, [item])

  const groups = useMemo(() => {
    const g = new Map<string, MenuView["ingredients"]>()
    for (const ing of ingredients) g.set(ing.groupName, [...(g.get(ing.groupName) ?? []), ing])
    return [...g.entries()]
  }, [ingredients])

  const toggle = (ing: MenuView["ingredients"][number]) =>
    setExtras((prev) =>
      prev.some((e) => e.ingredientId === ing.id)
        ? prev.filter((e) => e.ingredientId !== ing.id)
        : [...prev, { ingredientId: ing.id, name: ing.name, unitPrice: ing.price, quantity: 1 }],
    )
  const setExtraQty = (id: string, q: number) =>
    setExtras((prev) => (q < 1 ? prev.filter((e) => e.ingredientId !== id) : prev.map((e) => (e.ingredientId === id ? { ...e, quantity: q } : e))))

  if (!shown) return null
  const each = shown.price + extras.reduce((s, e) => s + e.unitPrice * e.quantity, 0)

  return (
    <BottomSheet
      open={!!item}
      onOpenChange={(o) => !o && onClose()}
      title={shown.name}
      hideTitle
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={qty} onChange={setQty} label={`quantidade de ${shown.name}`} />
          <Button
            type="button"
            size="lg"
            className="h-12 flex-1 rounded-full text-base font-semibold"
            onClick={() => onAdd({ menuItemId: shown.id, name: shown.name, unitPrice: shown.price, quantity: qty, extras })}
          >
            Adicionar · {formatBRL(each * qty)}
          </Button>
        </div>
      }
    >
      {shown.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown.imageUrl} alt={shown.name} className="aspect-[4/3] max-h-[38dvh] w-full bg-muted object-cover" />
      )}
      <div className={cn("space-y-1 px-5 pb-2", shown.imageUrl ? "pt-4" : "pt-14")}>
        <p className="text-2xl font-bold leading-tight">{shown.name}</p>
        {shown.description && <p className="text-muted-foreground">{shown.description}</p>}
        <p className="pt-1 text-lg font-bold text-primary">{formatBRL(shown.price)}</p>
      </div>

      {groups.length > 0 && (
        <div className="space-y-5 px-5 pb-6 pt-3">
          <p className="text-sm font-semibold">Quer turbinar? <span className="font-normal text-muted-foreground">(opcional)</span></p>
          {groups.map(([group, ings]) => (
            <fieldset key={group} className="space-y-2">
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group}</legend>
              {ings.map((ing) => {
                const chosen = extras.find((e) => e.ingredientId === ing.id)
                return (
                  <div
                    key={ing.id}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl border-2 pl-3 pr-2 transition-colors has-[button[aria-pressed]:focus-visible]:ring-2 has-[button[aria-pressed]:focus-visible]:ring-ring",
                      chosen ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <button type="button" onClick={() => toggle(ing)} aria-pressed={!!chosen} className="flex flex-1 items-center gap-3 py-3 text-left focus-visible:outline-none">
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                          chosen ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                        )}
                        aria-hidden
                      >
                        {chosen && <Check className="h-4 w-4" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 font-medium">{ing.name}</span>
                      <span className="text-sm text-muted-foreground">+ {formatBRL(ing.price)}</span>
                    </button>
                    {chosen && (
                      <QuantityStepper value={chosen.quantity} onChange={(q) => setExtraQty(ing.id, q)} min={0} max={10} size="sm" label={ing.name} />
                    )}
                  </div>
                )
              })}
            </fieldset>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
