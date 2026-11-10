import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, ImageOff, Trash2 } from "lucide-react"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { categories, ingredients, menuItems } from "@/db/schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/admin/form-ui"
import { requireStore } from "@/lib/auth/session"
import { formatBRL } from "@/lib/order-shared"
import {
  deleteCategoryAction,
  deleteIngredientAction,
  deleteItemAction,
  moveCategoryAction,
  moveItemAction,
  toggleAvailableAction,
  toggleIngredientAction,
} from "./actions"
import { CategoryForm, Collapsible, IngredientForm, ItemForm } from "./forms"

export const metadata = { title: "Cardápio" }

const TABS = { itens: "Lanches", adicionais: "Adicionais", categorias: "Categorias" } as const
type Tab = keyof typeof TABS

export default async function CardapioAdminPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { store, role, user } = await requireStore()
  const canEdit = role === "owner" || user.isSuperadmin
  const aba = ((await searchParams).aba ?? "itens") as Tab
  const tab: Tab = aba in TABS ? aba : "itens"

  const [cats, items, ings] = await Promise.all([
    db.select().from(categories).where(eq(categories.storeId, store.id)).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(menuItems).where(eq(menuItems.storeId, store.id)).orderBy(asc(menuItems.sortOrder), asc(menuItems.name)),
    db.select().from(ingredients).where(eq(ingredients.storeId, store.id)).orderBy(asc(ingredients.groupName), asc(ingredients.name)),
  ])
  const catOptions = cats.map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/loja/${store.slug}`} target="_blank">
              <ExternalLink className="w-4 h-4 mr-2" />
              Ver como cliente
            </Link>
          </Button>
        </div>

        <h1 className="text-4xl font-bold mb-2">Cardápio</h1>
        <p className="text-muted-foreground mb-6">
          {canEdit ? "As mudanças aparecem na hora para os clientes." : "Você pode marcar lanches como esgotados. O resto é com o dono da loja."}
        </p>

        <nav className="flex gap-1 border-b mb-6" aria-label="Seções do cardápio">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link
              key={t}
              href={`?aba=${t}`}
              aria-current={tab === t ? "page" : undefined}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TABS[t]}
            </Link>
          ))}
        </nav>

        {/* ---------- Lanches ---------- */}
        {tab === "itens" && (
          <div className="space-y-6">
            {canEdit && (
              <Card>
                <CardContent className="pt-6">
                  <Collapsible summary="+ Adicionar lanche" defaultOpen={items.length === 0}>
                    <ItemForm categories={catOptions} defaultCategoryId={cats[0]?.id} />
                  </Collapsible>
                </CardContent>
              </Card>
            )}

            {[...cats.map((c) => ({ id: c.id as string | null, name: c.name })), { id: null, name: "Sem categoria" }].map((section) => {
              const list = items.filter((i) => i.categoryId === section.id)
              if (!list.length) return null
              return (
                <Card key={section.id ?? "none"}>
                  <CardHeader>
                    <CardTitle>{section.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y">
                    {list.map((item, idx) => (
                      <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="w-14 h-14 shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <ImageOff className="w-5 h-5 text-muted-foreground" aria-label="Sem foto" />
                            )}
                          </div>
                          <div className="flex-1 min-w-40">
                            <p className="font-semibold">
                              {item.name}{" "}
                              {!item.active && <Badge variant="outline">Oculto</Badge>}{" "}
                              {!item.available && <Badge variant="destructive">Esgotado</Badge>}
                            </p>
                            <p className="text-sm text-muted-foreground">{formatBRL(Number(item.price))}</p>
                          </div>
                          <ActionButton action={toggleAvailableAction.bind(null, item.id)} size="sm" variant={item.available ? "outline" : "default"}>
                            {item.available ? "Marcar esgotado" : "Voltou a ter"}
                          </ActionButton>
                          {canEdit && (
                            <div className="flex gap-1">
                              <ActionButton action={moveItemAction.bind(null, item.id, "up")} size="icon" variant="ghost" disabled={idx === 0} aria-label={`Subir ${item.name}`}>
                                <ArrowUp className="w-4 h-4" />
                              </ActionButton>
                              <ActionButton action={moveItemAction.bind(null, item.id, "down")} size="icon" variant="ghost" disabled={idx === list.length - 1} aria-label={`Descer ${item.name}`}>
                                <ArrowDown className="w-4 h-4" />
                              </ActionButton>
                            </div>
                          )}
                        </div>
                        {canEdit && (
                          <Collapsible summary="Editar" className="mt-2">
                            <div className="space-y-4">
                              <ItemForm
                                item={{
                                  id: item.id,
                                  name: item.name,
                                  description: item.description,
                                  price: item.price,
                                  categoryId: item.categoryId,
                                  active: item.active,
                                  imageUrl: item.imageUrl,
                                }}
                                categories={catOptions}
                              />
                              <ActionButton
                                action={deleteItemAction.bind(null, item.id)}
                                confirmText={`Apagar "${item.name}" do cardápio? Pedidos antigos não são afetados.`}
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                                Apagar item
                              </ActionButton>
                            </div>
                          </Collapsible>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )
            })}
            {items.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum lanche cadastrado ainda.</p>}
          </div>
        )}

        {/* ---------- Adicionais ---------- */}
        {tab === "adicionais" && (
          <div className="space-y-6">
            {canEdit ? (
              <Card>
                <CardContent className="pt-6">
                  <Collapsible summary="+ Adicionar adicional" defaultOpen={ings.length === 0}>
                    <IngredientForm groups={[...new Set(ings.map((i) => i.groupName))]} />
                  </Collapsible>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">Só o dono da loja pode alterar os adicionais.</p>
            )}

            {[...new Set(ings.map((i) => i.groupName))].map((group) => (
              <Card key={group}>
                <CardHeader>
                  <CardTitle>{group}</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {ings
                    .filter((i) => i.groupName === group)
                    .map((ing) => (
                      <div key={ing.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex-1 min-w-40">
                            <p className="font-semibold">
                              {ing.name} {!ing.active && <Badge variant="outline">Indisponível</Badge>}
                            </p>
                            <p className="text-sm text-muted-foreground">+{formatBRL(Number(ing.price))}</p>
                          </div>
                          {canEdit && (
                            <ActionButton action={toggleIngredientAction.bind(null, ing.id)} size="sm" variant={ing.active ? "outline" : "default"}>
                              {ing.active ? "Desativar" : "Ativar"}
                            </ActionButton>
                          )}
                        </div>
                        {canEdit && (
                          <Collapsible summary="Editar" className="mt-2">
                            <div className="space-y-4">
                              <IngredientForm
                                ingredient={{ id: ing.id, name: ing.name, price: ing.price, groupName: ing.groupName, active: ing.active }}
                                groups={[...new Set(ings.map((i) => i.groupName))]}
                              />
                              <ActionButton
                                action={deleteIngredientAction.bind(null, ing.id)}
                                confirmText={`Apagar o adicional "${ing.name}"?`}
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                                Apagar adicional
                              </ActionButton>
                            </div>
                          </Collapsible>
                        )}
                      </div>
                    ))}
                </CardContent>
              </Card>
            ))}
            {ings.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum adicional cadastrado.</p>}
          </div>
        )}

        {/* ---------- Categorias ---------- */}
        {tab === "categorias" && (
          <Card>
            <CardHeader>
              <CardTitle>Categorias</CardTitle>
              <CardDescription>A ordem aqui é a ordem em que aparecem no cardápio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {canEdit && <CategoryForm />}
              <div className="divide-y">
                {cats.map((cat, idx) => {
                  const n = items.filter((i) => i.categoryId === cat.id).length
                  return (
                    <div key={cat.id} className="py-4 flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-56">
                        {canEdit ? <CategoryForm category={cat} /> : <p className="font-semibold">{cat.name}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {n} {n === 1 ? "item" : "itens"}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          <ActionButton action={moveCategoryAction.bind(null, cat.id, "up")} size="icon" variant="ghost" disabled={idx === 0} aria-label={`Subir ${cat.name}`}>
                            <ArrowUp className="w-4 h-4" />
                          </ActionButton>
                          <ActionButton action={moveCategoryAction.bind(null, cat.id, "down")} size="icon" variant="ghost" disabled={idx === cats.length - 1} aria-label={`Descer ${cat.name}`}>
                            <ArrowDown className="w-4 h-4" />
                          </ActionButton>
                          <ActionButton
                            action={deleteCategoryAction.bind(null, cat.id)}
                            confirmText={`Apagar a categoria "${cat.name}"? Os ${n} itens dela continuam no cardápio, sem categoria.`}
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={`Apagar ${cat.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  )
                })}
                {cats.length === 0 && <p className="text-muted-foreground py-4">Nenhuma categoria. Os lanches aparecem todos juntos.</p>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
