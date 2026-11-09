"use client"

import { createContext, useContext, useState } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
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
}

/** Criar (sem `item`) ou editar um lanche. */
export function ItemForm({
  item,
  categories,
  defaultCategoryId,
}: {
  item?: ItemFormData
  categories: { id: string; name: string }[]
  defaultCategoryId?: string | null
}) {
  const close = useContext(CloseContext)
  return (
    <ActionForm action={saveItemAction} resetOnSuccess={!item} onSuccess={item ? close : undefined} className="space-y-4">
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
            <Label htmlFor={`desc-${item?.id ?? "novo"}`} className="mb-1.5">
              Descrição
            </Label>
            <Textarea
              id={`desc-${item?.id ?? "novo"}`}
              name="description"
              rows={2}
              maxLength={300}
              defaultValue={item?.description ?? ""}
              placeholder="Ingredientes, tamanho… (opcional)"
            />
            {s.fieldErrors?.description && <p className="text-sm text-destructive mt-1">{s.fieldErrors.description}</p>}
          </div>
          <div className="grid sm:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor={`cat-${item?.id ?? "novo"}`} className="mb-1.5">
                Categoria
              </Label>
              <select
                id={`cat-${item?.id ?? "novo"}`}
                name="categoryId"
                defaultValue={item ? (item.categoryId ?? "") : (defaultCategoryId ?? "")}
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
          <SubmitButton>{item ? "Salvar alterações" : "Adicionar item"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

export function CategoryForm({ category }: { category?: { id: string; name: string } }) {
  return (
    <ActionForm action={saveCategoryAction} resetOnSuccess={!category} className="flex flex-wrap items-end gap-2">
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
          <SubmitButton variant={category ? "outline" : "default"}>{category ? "Renomear" : "Criar"}</SubmitButton>
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
  return (
    <ActionForm action={saveIngredientAction} resetOnSuccess={!ingredient} onSuccess={ingredient ? close : undefined} className="space-y-4">
      {(s) => (
        <>
          {ingredient && <input type="hidden" name="id" value={ingredient.id} />}
          <div className="grid sm:grid-cols-[1fr_120px_1fr] gap-4">
            <Field label="Nome" name="name" defaultValue={ingredient?.name} placeholder="Ex.: Bacon" required maxLength={60} error={s.fieldErrors?.name} />
            <Field
              label="Preço (R$)"
              name="price"
              inputMode="decimal"
              placeholder="5,00"
              defaultValue={priceText(ingredient?.price)}
              required
              error={s.fieldErrors?.price}
            />
            <Field
              label="Grupo"
              name="groupName"
              list={listId}
              defaultValue={ingredient?.groupName ?? ""}
              placeholder="Ex.: Molhos"
              maxLength={40}
              error={s.fieldErrors?.groupName}
              hint="Agrupa os adicionais na tela do cliente"
            />
            <datalist id={listId}>
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={ingredient?.active ?? true} className="h-4 w-4 accent-[var(--primary)]" />
            Disponível para os clientes
          </label>
          <SubmitButton>{ingredient ? "Salvar alterações" : "Adicionar adicional"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

/** Bloco recolhível (abre o formulário de edição/criação). Formulários de edição dentro dele o fecham ao salvar. */
const CloseContext = createContext<(() => void) | undefined>(undefined)

export function Collapsible({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={className}>
      <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:underline w-fit">{summary}</summary>
      {open && (
        <CloseContext.Provider value={() => setOpen(false)}>
          <div className="pt-4">{children}</div>
        </CloseContext.Provider>
      )}
    </details>
  )
}
