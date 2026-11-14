"use client"

import { useState } from "react"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { Label } from "@/components/ui/label"
import { fmtQty, UNIT_LABEL } from "@/lib/stock-format"
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
              defaultValue={current?.minStock != null ? fmtQty(current.minStock) : ""}
              placeholder="ex.: 20"
              error={s.fieldErrors?.minStock}
            />
            {isExtra ? (
              <Field
                label="1 adicional gasta"
                name="extraAmount"
                inputMode="decimal"
                defaultValue={fmtQty(current?.extraAmount ?? 1)}
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

/** Ficha de estoque de um lanche: quanto 1 unidade gasta de cada ingrediente controlado. */
export function RecipeQtyForm({
  itemId,
  tracked,
  quantities,
}: {
  itemId: string
  tracked: { id: string; name: string; unit: string }[]
  quantities: Record<string, number>
}) {
  return (
    <ActionForm action={saveRecipeQtyAction} className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="itemId" value={itemId} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tracked.map((t) => (
              <Field
                key={t.id}
                label={`${t.name} (${t.unit})`}
                name={`q_${t.id}`}
                inputMode="decimal"
                defaultValue={quantities[t.id] ? fmtQty(quantities[t.id]) : ""}
                placeholder="0"
                error={s.fieldErrors?.[`q_${t.id}`]}
              />
            ))}
          </div>
          <SubmitButton size="sm">Salvar ficha</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
