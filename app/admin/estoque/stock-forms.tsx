"use client"

import { useState } from "react"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { Label } from "@/components/ui/label"
import { fmtInput, UNIT_LABEL } from "@/lib/stock-format"
import { saveRecipeQtyAction, stockMovementAction, trackIngredientAction } from "./actions"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"


/** Passar a controlar um ingrediente (um que já existe ou um novo, como "Pão"). Também serve para editar. */
export function TrackForm({
  options,
  current,
}: {
  /** ingredientes ainda não controlados */
  options?: { id: string; name: string; isExtra: boolean }[]
  /** editando um que já é controlado */
  current?: { id: string; name: string; isExtra: boolean; unit: string; minStock: number | null; extraAmount: number }
}) {
  const [pick, setPick] = useState(current?.id ?? "")
  const isExtra = current?.isExtra ?? options?.find((o) => o.id === pick)?.isExtra ?? false
  return (
    <ActionForm action={trackIngredientAction} className="space-y-4">
      {(s) => (
        <>
          {current ? (
            <input type="hidden" name="id" value={current.id} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="track-pick" className="mb-1.5">
                  Ingrediente
                </Label>
                <select id="track-pick" name="id" value={pick} onChange={(e) => setPick(e.target.value)} className={selectClass}>
                  <option value="">Novo ingrediente…</option>
                  {options?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.isExtra ? " (adicional)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {!pick && <Field label="Nome do novo ingrediente" name="newName" placeholder="Pão, Carne 120 g…" error={s.fieldErrors?.newName} maxLength={60} />}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`unit-${current?.id ?? "novo"}`} className="mb-1.5">
                Unidade
              </Label>
              <select id={`unit-${current?.id ?? "novo"}`} name="unit" defaultValue={current?.unit ?? "un"} className={selectClass}>
                {Object.entries(UNIT_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l} ({v})
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Avisar quando tiver menos de"
              name="minStock"
              inputMode="decimal"
              defaultValue={current?.minStock != null ? fmtInput(current.minStock) : ""}
              placeholder="ex.: 20"
              error={s.fieldErrors?.minStock}
            />
            {isExtra ? (
              <Field
                label="1 adicional gasta"
                name="extraAmount"
                inputMode="decimal"
                defaultValue={fmtInput(current?.extraAmount ?? 1)}
                hint="Ex.: bacon extra = 2 fatias"
                error={s.fieldErrors?.extraAmount}
              />
            ) : (
              <input type="hidden" name="extraAmount" value="1" />
            )}
          </div>
          <SubmitButton>{current ? "Salvar" : "Controlar estoque"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

/** Entrada, perda ou contagem de um ingrediente. */
export function MovementForm({ ingredientId, unit }: { ingredientId: string; unit: string }) {
  const [kind, setKind] = useState("purchase")
  return (
    <ActionForm action={stockMovementAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr_auto] sm:items-end">
      {(s) => (
        <>
          <input type="hidden" name="ingredientId" value={ingredientId} />
          <div>
            <Label htmlFor={`kind-${ingredientId}`} className="mb-1.5">
              O que foi
            </Label>
            <select id={`kind-${ingredientId}`} name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
              <option value="purchase">Entrada (compra)</option>
              <option value="loss">Perda (estragou, caiu)</option>
              <option value="adjust">Contagem (tenho agora)</option>
            </select>
          </div>
          <Field label={kind === "adjust" ? `Tenho (${unit})` : `Quantidade (${unit})`} name="amount" inputMode="decimal" required error={s.fieldErrors?.amount} />
          <Field label="Observação (opcional)" name="note" maxLength={200} placeholder={kind === "purchase" ? "Fornecedor, nota…" : ""} />
          <SubmitButton variant="outline">Lançar</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

/**
 * Ficha de estoque de um lanche: quanto 1 unidade gasta de cada ingrediente controlado DELE (`initial`: os da
 * descrição/ficha). Outro controlado entra pelo "+ Ingrediente". Só os campos na tela são salvos.
 */
export function RecipeQtyForm({
  itemId,
  itemName,
  tracked,
  initial,
  quantities,
}: {
  itemId: string
  /** lista compacta ("Outros itens"): o nome vai na mesma linha */
  itemName?: string
  tracked: { id: string; name: string; unit: string }[]
  initial: string[]
  quantities: Record<string, number>
}) {
  const [shown, setShown] = useState<string[]>(initial)
  const fields = tracked.filter((t) => shown.includes(t.id))
  const rest = tracked.filter((t) => !shown.includes(t.id))
  const addSelect = rest.length > 0 && (
    <select
      aria-label={`Incluir ingrediente${itemName ? ` em ${itemName}` : ""}`}
      value=""
      onChange={(e) => e.target.value && setShown((s) => [...s, e.target.value])}
      className={`${selectClass} w-auto text-primary`}
    >
      <option value="">+ Ingrediente</option>
      {rest.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
  return (
    <ActionForm action={saveRecipeQtyAction} className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="itemId" value={itemId} />
          {itemName && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{itemName}</span>
              {addSelect}
            </div>
          )}
          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {fields.map((t) => (
                <Field
                  key={t.id}
                  label={`${t.name} (${t.unit})`}
                  name={`q_${t.id}`}
                  inputMode="decimal"
                  defaultValue={quantities[t.id] ? fmtInput(quantities[t.id]) : ""}
                  placeholder="0"
                  error={s.fieldErrors?.[`q_${t.id}`]}
                />
              ))}
            </div>
          )}
          {(fields.length > 0 || !itemName) && (
            <div className="flex flex-wrap items-center gap-2">
              {fields.length > 0 && <SubmitButton size="sm">Salvar ficha</SubmitButton>}
              {!itemName && addSelect}
            </div>
          )}
        </>
      )}
    </ActionForm>
  )
}
