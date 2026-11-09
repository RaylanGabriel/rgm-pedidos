"use client"

import { useMemo, useState } from "react"
import { Minus, Plus, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CartExtra, CartLine } from "@/lib/cart"
import type { MenuItemView, MenuView } from "@/lib/orders"
import { formatBRL } from "@/lib/order-shared"

/**
 * Escolha de lanche + adicionais. Usado no cardápio público e no "Novo pedido" do painel.
 */
export function ItemPicker({ menu, onAdd, disabled }: { menu: MenuView; onAdd: (line: CartLine) => void; disabled?: boolean }) {
  const [selected, setSelected] = useState<MenuItemView | null>(null)
  const [extras, setExtras] = useState<CartExtra[]>([])

  // Lanches agrupados por categoria (itens sem categoria vão para "Outros")
  const sections = useMemo(() => {
    const byCat = new Map<string | null, MenuItemView[]>()
    for (const item of menu.items) byCat.set(item.categoryId, [...(byCat.get(item.categoryId) ?? []), item])
    const named = menu.categories.filter((c) => byCat.has(c.id)).map((c) => ({ id: c.id, name: c.name, items: byCat.get(c.id)! }))
    const orphans = [...byCat.entries()].filter(([id]) => !id || !menu.categories.some((c) => c.id === id)).flatMap(([, i]) => i)
    return orphans.length ? [...named, { id: "outros", name: named.length ? "Outros" : "Lanches", items: orphans }] : named
  }, [menu])

  const groups = useMemo(() => {
    const g = new Map<string, MenuView["ingredients"]>()
    for (const ing of menu.ingredients) g.set(ing.groupName, [...(g.get(ing.groupName) ?? []), ing])
    return [...g.entries()]
  }, [menu.ingredients])

  const toggleExtra = (ing: MenuView["ingredients"][number]) =>
    setExtras((prev) =>
      prev.some((e) => e.ingredientId === ing.id)
        ? prev.filter((e) => e.ingredientId !== ing.id)
        : [...prev, { ingredientId: ing.id, name: ing.name, unitPrice: ing.price, quantity: 1 }],
    )

  const changeExtra = (id: string, delta: number) =>
    setExtras((prev) => prev.map((e) => (e.ingredientId === id ? { ...e, quantity: Math.min(10, Math.max(1, e.quantity + delta)) } : e)))

  const add = () => {
    if (!selected) return
    onAdd({ menuItemId: selected.id, name: selected.name, unitPrice: selected.price, quantity: 1, extras })
    setSelected(null)
    setExtras([])
  }

  const selectedTotal = selected ? selected.price + extras.reduce((s, e) => s + e.unitPrice * e.quantity, 0) : 0

  return (
    <div className="space-y-8">
      {sections.length === 0 && <p className="text-muted-foreground">O cardápio ainda está vazio.</p>}

      {sections.map((section) => (
        <section key={section.id}>
          <h2 className="text-2xl font-bold mb-4">{section.name}</h2>
          <div className="grid gap-4">
            {section.items.map((item) => {
              const isSelected = selected?.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.available || disabled}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelected(isSelected ? null : item)
                    setExtras([])
                  }}
                  className={`text-left rounded-xl border-2 bg-card p-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected ? "border-primary shadow-md" : "border-border hover:border-primary/50 hover:shadow"
                  }`}
                >
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-lg">{item.name}</h3>
                      {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-primary">{formatBRL(item.price)}</p>
                      {!item.available && <p className="text-xs font-semibold text-destructive">Esgotado</p>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {selected && (
        <Card className="border-primary border-2">
          <CardHeader>
            <CardTitle>{selected.name}</CardTitle>
            <CardDescription>{groups.length ? "Quer adicionar algo?" : "Confira e adicione ao pedido"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {groups.map(([group, ings]) => (
              <div key={group}>
                <p className="text-sm font-semibold text-muted-foreground mb-2">{group}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {ings.map((ing) => {
                    const chosen = extras.find((e) => e.ingredientId === ing.id)
                    return (
                      <div key={ing.id} className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={chosen ? "default" : "outline"}
                          size="sm"
                          className="flex-1 justify-between"
                          onClick={() => toggleExtra(ing)}
                          aria-pressed={!!chosen}
                        >
                          <span className="truncate">{ing.name}</span>
                          <span>+{formatBRL(ing.price)}</span>
                        </Button>
                        {chosen && (
                          <div className="flex items-center gap-1">
                            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeExtra(ing.id, -1)} aria-label={`Menos ${ing.name}`}>
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-5 text-center text-sm">{chosen.quantity}</span>
                            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => changeExtra(ing.id, 1)} aria-label={`Mais ${ing.name}`}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <Button type="button" onClick={add} className="w-full" size="lg">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Adicionar · {formatBRL(selectedTotal)}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
