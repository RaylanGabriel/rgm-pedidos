"use client"

import { useContext, useState } from "react"
import { Check, Plus } from "lucide-react"
import { descriptionParts, nameKey, suggestRemovable } from "@/lib/recipe"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { ImageInput } from "@/components/admin/image-input"
import { CloseContext } from "@/components/admin/collapsible"
import { saveCategoryAction, saveIngredientAction, saveItemAction } from "./actions"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"

const priceText = (v?: string | number) => (v === undefined ? "" : Number(v).toFixed(2).replace(".", ","))

export interface ItemFormData {
  id: string
  name: string
  description: string | null
  price: string
  categoryId: string | null
  active: boolean
  imageUrl: string | null
  alsoIn: string[]
  /** Nomes dos ingredientes que o cliente pode tirar (botões "sem ___") */
  removable: string[]
}

/** Criar (sem `item`) ou editar um lanche. */
export function ItemForm({
  item,
  categories,
  defaultCategoryId,
}: {
  item?: ItemFormData
  categories: { id: string; name: string; extrasEnabled: boolean }[]
  defaultCategoryId?: string | null
}) {
  const close = useContext(CloseContext)
  const initialCategory = item ? (item.categoryId ?? "") : (defaultCategoryId ?? "")
  const [primary, setPrimary] = useState(initialCategory)
  const [description, setDescription] = useState(item?.description ?? "")
  const [resetKey, setResetKey] = useState(0) // novo item salvo: zera as escolhas do "sem ___" também
  const descId = `desc-${item?.id ?? "novo"}`
  // Bebidas, sobremesas…: categoria sem adicionais não sugere botões "sem ___" (o dono ainda pode ligar)
  const suggest = categories.find((c) => c.id === primary)?.extrasEnabled ?? true
  return (
    <ActionForm
      action={saveItemAction}
      resetOnSuccess={!item}
      onSuccess={
        item
          ? close
          : () => {
              setPrimary(initialCategory)
              setDescription("")
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ingredientes separados por vírgula: pão brioche, carne 120g, queijo, cebola e picles"
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
          {/* key: renasce ao salvar um item novo ou quando o que foi salvo muda */}
          <RemovablePicker
            key={`${resetKey}:${(item?.removable ?? []).join("|")}`}
            description={description}
            saved={item?.removable ?? []}
            suggest={suggest}
          />
          <SubmitButton>{item ? "Salvar alterações" : "Adicionar item"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

/**
 * Botões "sem ___" do lanche: saem da descrição (atualizam ao digitar) e o dono toca no que o cliente pode tirar.
 * Adicionais não entram (para não querer um adicional, é só não escolher). Manda `removable` (nomes) para
 * saveItemAction.
 */
function RemovablePicker({ description, saved, suggest }: { description: string; saved: string[]; suggest: boolean }) {
  const parts = descriptionParts(description)
  // Escolhas do dono por nome. Lanche já salvo: o que está na descrição e não foi salvo começa desligado.
  const [choice, setChoice] = useState(() => {
    const on = new Set(saved.map(nameKey))
    return saved.length ? new Map(parts.map((p) => [nameKey(p), on.has(nameKey(p))])) : new Map<string, boolean>()
  })
  const isOn = (p: string) => choice.get(nameKey(p)) ?? (suggest && suggestRemovable(p))
  const chosen = parts.filter(isOn)

  return (
    <fieldset className="rounded-lg border p-3">
      <input type="hidden" name="recipeForm" value="1" />
      {chosen.map((p) => (
        <input key={p} type="hidden" name="removable" value={p} />
      ))}
      <legend className="px-1 text-sm font-medium">O cliente pode tirar</legend>
      {parts.length ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Vem da descrição acima. Toque no que o cliente pode pedir “sem” (ex.: cebola, picles); deixe apagado o que
            não sai (carne, pão).
          </p>
          <div className="flex flex-wrap gap-2">
            {parts.map((p) => {
              const on = isOn(p)
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChoice((c) => new Map(c).set(nameKey(p), !on))}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    on
                      ? "border-2 border-primary bg-primary/10 font-medium text-foreground"
                      : "border border-dashed text-muted-foreground hover:border-primary hover:text-foreground"
                  }`}
                >
                  {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                  {p}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {chosen.length
              ? `O cliente verá: ${chosen.map((p) => `“Sem ${p.toLowerCase()}”`).join(", ")}.`
              : "Nenhum marcado: o cliente não vê botões “sem ___” neste item."}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Escreva os ingredientes na descrição, separados por vírgula, e escolha aqui o que o cliente pode tirar.
        </p>
      )}
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
