"use client"

import { useContext, useState } from "react"
import { Lock, LockOpen, Plus, X } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { ImageInput } from "@/components/admin/image-input"
import { CloseContext } from "@/components/admin/collapsible"
import { saveCategoryAction, saveIngredientAction, saveItemAction } from "./actions"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"

const priceText = (v?: string | number) => (v === undefined ? "" : Number(v).toFixed(2).replace(".", ","))

export interface RecipeEntry {
  ingredientId: string
  removable: boolean
}

export interface ItemFormData {
  id: string
  name: string
  description: string | null
  price: string
  categoryId: string | null
  active: boolean
  imageUrl: string | null
  alsoIn: string[]
  recipe: RecipeEntry[]
}

/** Criar (sem `item`) ou editar um lanche. */
export function ItemForm({
  item,
  categories,
  ingredients,
  defaultCategoryId,
}: {
  item?: ItemFormData
  categories: { id: string; name: string }[]
  /** Todos os ingredientes da loja (para montar a ficha técnica) */
  ingredients: { id: string; name: string }[]
  defaultCategoryId?: string | null
}) {
  const close = useContext(CloseContext)
  const initialCategory = item ? (item.categoryId ?? "") : (defaultCategoryId ?? "")
  const [primary, setPrimary] = useState(initialCategory)
  const [resetKey, setResetKey] = useState(0) // novo item salvo: zera a ficha também
  const descId = `desc-${item?.id ?? "novo"}`
  return (
    <ActionForm
      action={saveItemAction}
      resetOnSuccess={!item}
      onSuccess={
        item
          ? close
          : () => {
              setPrimary(initialCategory)
              setResetKey((k) => k + 1)
            }
      }
      className="space-y-4"
    >
      {(s) => (
        <>
          {item && <input type="hidden" name="id" value={item.id} />}
          <div className="grid sm:grid-cols-[1fr_140px] gap-4">
            <Field label="Nome" name="name" defaultValue={item?.name} required maxLength={80} error={s.fieldErrors?.name} />
            <Field
              label="Preço (R$)"
              name="price"
              inputMode="decimal"
              placeholder="18,90"
              defaultValue={priceText(item?.price)}
              required
              error={s.fieldErrors?.price}
            />
          </div>
          <div>
            <Label htmlFor={descId} className="mb-1.5">
              Descrição
            </Label>
            <Textarea
              id={descId}
              name="description"
              rows={2}
              maxLength={300}
              defaultValue={item?.description ?? ""}
              placeholder="Ingredientes, tamanho… (opcional)"
            />
            {s.fieldErrors?.description && <p className="text-sm text-destructive mt-1">{s.fieldErrors.description}</p>}
          </div>
          <ImageInput currentUrl={item?.imageUrl} error={s.fieldErrors?.image} />
          <div className="grid sm:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor={`cat-${item?.id ?? "novo"}`} className="mb-1.5">
                Categoria
              </Label>
              <select
                id={`cat-${item?.id ?? "novo"}`}
                name="categoryId"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className={selectClass}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm h-9">
              <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="h-4 w-4 accent-[var(--primary)]" />
              Mostrar no cardápio
            </label>
          </div>
          {categories.length > 1 && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Também mostrar em</legend>
              <p className="mb-2 text-xs text-muted-foreground">
                Ex.: coloque o item em “Mais vendidos” ou “Vegetarianos” sem tirar da categoria principal.
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.filter((c) => c.id !== primary).map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input type="checkbox" name="alsoIn" value={c.id} defaultChecked={item?.alsoIn.includes(c.id)} className="h-4 w-4 accent-[var(--primary)]" />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {/* key: renasce ao salvar (novo item) ou quando a ficha salva muda (ingredientes recém-criados viram chips) */}
          <RecipePicker
            key={`${resetKey}:${(item?.recipe ?? []).map((r) => `${r.ingredientId}${r.removable ? "" : "!"}`).join(",")}:${ingredients.length}`}
            ingredients={ingredients}
            initial={item?.recipe ?? []}
            descriptionId={descId}
          />
          <SubmitButton>{item ? "Salvar alterações" : "Adicionar item"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

/** "Pão brioche, smash 90g e cebola." → ["Pão brioche", "smash 90g", "cebola"] (sugestão; o dono revisa antes de salvar) */
const splitIngredients = (text: string) =>
  text
    .split(/[,;\n]+|\s+e\s+/i)
    .map((s) => s.trim().replace(/[.!]+$/, ""))
    .filter((s) => s.length >= 2 && s.length <= 60)

/**
 * Ficha técnica do lanche: quais ingredientes ele leva e quais o cliente pode tirar ("sem cebola").
 * Manda `recipe` (ids, na ordem), `fixed` (não pode tirar) e `newIngredients` (texto) para saveItemAction.
 */
function RecipePicker({ ingredients, initial, descriptionId }: { ingredients: { id: string; name: string }[]; initial: RecipeEntry[]; descriptionId: string }) {
  const [recipe, setRecipe] = useState<RecipeEntry[]>(initial)
  const [typed, setTyped] = useState("")
  const name = new Map(ingredients.map((i) => [i.id, i.name]))
  const chosen = new Set(recipe.map((r) => r.ingredientId))
  const others = ingredients.filter((i) => !chosen.has(i.id))

  const add = (id: string) => setRecipe((r) => [...r, { ingredientId: id, removable: true }])
  const drop = (id: string) => setRecipe((r) => r.filter((x) => x.ingredientId !== id))
  const toggleFixed = (id: string) => setRecipe((r) => r.map((x) => (x.ingredientId === id ? { ...x, removable: !x.removable } : x)))
  const fromDescription = () => {
    const desc = (document.getElementById(descriptionId) as HTMLTextAreaElement | null)?.value ?? ""
    const known = new Set(recipe.map((r) => (name.get(r.ingredientId) ?? "").toLowerCase()))
    const parts = splitIngredients(desc).filter((p) => !known.has(p.toLowerCase()))
    // Os que já existem no cadastro entram direto; os novos vão para o campo de texto (criados ao salvar)
    const byName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i.id]))
    const existing = parts.map((p) => byName.get(p.toLowerCase())).filter((id): id is string => !!id && !chosen.has(id))
    const fresh = parts.filter((p) => !byName.has(p.toLowerCase()))
    setRecipe((r) => [...r, ...[...new Set(existing)].map((id) => ({ ingredientId: id, removable: true }))])
    if (fresh.length) setTyped((t) => [t, fresh.join(", ")].filter(Boolean).join(", "))
  }

  return (
    <fieldset className="rounded-lg border p-3">
      <input type="hidden" name="recipeForm" value="1" />
      {recipe.map((r) => (
        <span key={r.ingredientId}>
          <input type="hidden" name="recipe" value={r.ingredientId} />
          {!r.removable && <input type="hidden" name="fixed" value={r.ingredientId} />}
        </span>
      ))}
      <legend className="px-1 text-sm font-medium">Ingredientes deste lanche</legend>
      <p className="mb-3 text-xs text-muted-foreground">
        Viram os botões “sem cebola” para o cliente. Toque no cadeado no que não dá para tirar (ex.: pão, carne).
      </p>

      {recipe.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Ingredientes escolhidos">
          {recipe.map((r) => (
            <li key={r.ingredientId} className="flex items-center rounded-full border-2 border-primary bg-primary/10 text-sm">
              <span className="pl-3 font-medium">{name.get(r.ingredientId) ?? "?"}</span>
              <button
                type="button"
                onClick={() => toggleFixed(r.ingredientId)}
                aria-pressed={!r.removable}
                title={r.removable ? "O cliente pode tirar. Toque para travar." : "Fixo: o cliente não pode tirar. Toque para liberar."}
                className="ml-1 inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {r.removable ? <LockOpen className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3.5 w-3.5 text-foreground" aria-hidden />}
                <span>{r.removable ? "pode tirar" : "fixo"}</span>
              </button>
              <button
                type="button"
                onClick={() => drop(r.ingredientId)}
                aria-label={`Tirar ${name.get(r.ingredientId)} da ficha`}
                className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">Nenhum ingrediente ainda: o cliente não vê botões “sem ___” neste lanche.</p>
      )}

      {others.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Adicionar da lista</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {others.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => add(i.id)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {i.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field
          label="Novos ingredientes"
          name="newIngredients"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Ex.: pão brioche, cebola roxa, picles"
          maxLength={600}
          hint="Separe por vírgula. São criados ao salvar e já entram neste lanche."
          className="min-w-56 flex-1"
        />
        <button
          type="button"
          onClick={fromDescription}
          className="mb-5 inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Copiar da descrição
        </button>
      </div>
    </fieldset>
  )
}

export function CategoryForm({ category }: { category?: { id: string; name: string; extrasEnabled: boolean } }) {
  return (
    <ActionForm action={saveCategoryAction} resetOnSuccess={!category} className="flex flex-wrap items-end gap-x-3 gap-y-2">
      {(s) => (
        <>
          {category && <input type="hidden" name="id" value={category.id} />}
          <Field
            label={category ? "Nome da categoria" : "Nova categoria"}
            name="name"
            defaultValue={category?.name}
            placeholder="Ex.: Bebidas"
            required
            maxLength={40}
            error={s.fieldErrors?.name}
            className="flex-1 min-w-48"
          />
          <label className="flex items-center gap-2 text-sm h-9 cursor-pointer" title="Mostra a lista de adicionais (bacon, queijo…) ao escolher itens desta categoria">
            <input type="checkbox" name="extrasEnabled" defaultChecked={category?.extrasEnabled ?? true} className="h-4 w-4 accent-[var(--primary)]" />
            Oferecer adicionais
          </label>
          <SubmitButton variant={category ? "outline" : "default"}>{category ? "Salvar" : "Criar"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

export interface IngredientFormData {
  id: string
  name: string
  price: string
  groupName: string
  isExtra: boolean
  active: boolean
}

export function IngredientForm({
  ingredient,
  groups,
}: {
  ingredient?: IngredientFormData
  groups: string[]
}) {
  const close = useContext(CloseContext)
  const listId = `grupos-${ingredient?.id ?? "novo"}`
  const [isExtra, setIsExtra] = useState(ingredient?.isExtra ?? true)
  return (
    <ActionForm
      action={saveIngredientAction}
      resetOnSuccess={!ingredient}
      onSuccess={ingredient ? close : () => setIsExtra(true)}
      className="space-y-4"
    >
      {(s) => (
        <>
          {ingredient && <input type="hidden" name="id" value={ingredient.id} />}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="isExtra"
              checked={isExtra}
              onChange={(e) => setIsExtra(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="font-medium">Vender também como adicional</span>
              <span className="block text-muted-foreground">
                Aparece em “Quer turbinar?” com preço. Desmarcado: só compõe os lanches (ex.: pão, cebola).
              </span>
            </span>
          </label>
          <div className={isExtra ? "grid sm:grid-cols-[1fr_120px_1fr] gap-4" : "grid sm:grid-cols-[1fr_1fr] gap-4"}>
            <Field label="Nome" name="name" defaultValue={ingredient?.name} placeholder="Ex.: Bacon" required maxLength={60} error={s.fieldErrors?.name} />
            {isExtra && (
              <Field
                label="Preço (R$)"
                name="price"
                inputMode="decimal"
                placeholder="5,00"
                defaultValue={ingredient?.isExtra ? priceText(ingredient.price) : ""}
                required
                error={s.fieldErrors?.price}
              />
            )}
            <Field
              label="Grupo"
              name="groupName"
              list={listId}
              defaultValue={ingredient?.groupName ?? ""}
              placeholder={isExtra ? "Ex.: Molhos" : "Ex.: Base"}
              maxLength={40}
              error={s.fieldErrors?.groupName}
              hint={isExtra ? "Agrupa os adicionais na tela do cliente" : "Só para organizar esta lista"}
            />
            <datalist id={listId}>
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={ingredient?.active ?? true} className="h-4 w-4 accent-[var(--primary)]" />
            {isExtra ? "Disponível como adicional" : "Ativo"}
          </label>
          <SubmitButton>{ingredient ? "Salvar alterações" : "Adicionar ingrediente"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
