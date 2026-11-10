"use client"

import { useContext, useState } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { CloseContext } from "@/components/admin/collapsible"
import { bulkAddZonesAction, saveDeliverySettingsAction, saveZoneAction } from "./actions"

const money = (v: number) => (v ? v.toFixed(2).replace(".", ",") : "")

export interface DeliverySettings {
  enabled: boolean
  pricing: "fixed" | "zones"
  fixedFee: number
  minOrder: number
}

export function DeliverySettingsForm({ values, zoneCount }: { values: DeliverySettings; zoneCount: number }) {
  const [enabled, setEnabled] = useState(values.enabled)
  const [pricing, setPricing] = useState(values.pricing)

  const option = (value: "fixed" | "zones", title: string, text: string) => (
    <label
      className={`flex-1 min-w-56 cursor-pointer rounded-lg border-2 p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
        pricing === value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
      }`}
    >
      <input type="radio" name="deliveryPricing" value={value} checked={pricing === value} onChange={() => setPricing(value)} className="sr-only" />
      <span className="font-medium">{title}</span>
      <span className="block text-sm text-muted-foreground">{text}</span>
    </label>
  )

  return (
    <ActionForm action={saveDeliverySettingsAction} className="space-y-5">
      {(s) => (
        <>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="deliveryEnabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="font-medium">Fazer entregas</span>
              <span className="block text-sm text-muted-foreground">Desmarcado, o cliente só pode escolher retirada ou comer no local.</span>
            </span>
          </label>

          {/* Com a entrega desligada os campos só ficam apagados (continuam sendo enviados e guardados) */}
          <div className={`space-y-5 transition-opacity ${enabled ? "" : "opacity-50"}`}>
            <div>
              <p className="text-sm font-medium mb-2">Como cobrar a entrega</p>
              <div className="flex flex-wrap gap-3" role="radiogroup">
                {option("fixed", "Taxa fixa", "O mesmo valor para qualquer endereço.")}
                {option("zones", "Por bairro", "Cada bairro tem seu valor; o cliente escolhe o dele numa lista.")}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Escondido (não removido) no modo por bairro, para não perder o valor */}
              <Field
                label="Taxa de entrega (R$)"
                name="deliveryFixedFee"
                inputMode="decimal"
                placeholder="0,00 = grátis"
                defaultValue={money(values.fixedFee)}
                error={s.fieldErrors?.deliveryFixedFee}
                hint="Deixe vazio para entrega grátis"
                className={pricing === "fixed" ? "" : "hidden"}
              />
              <Field
                label="Pedido mínimo para entrega (R$)"
                name="deliveryMinOrder"
                inputMode="decimal"
                placeholder="0,00 = sem mínimo"
                defaultValue={money(values.minOrder)}
                error={s.fieldErrors?.deliveryMinOrder}
                hint="Valor dos lanches, sem contar a taxa"
              />
            </div>
          </div>

          {enabled && pricing === "zones" && zoneCount === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Cadastre pelo menos um bairro abaixo: sem bairros, a opção de entrega não aparece para o cliente.
            </p>
          )}
          {s.fieldErrors?.deliveryPricing && <p className="text-sm text-destructive">{s.fieldErrors.deliveryPricing}</p>}
          <SubmitButton>Salvar regras</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

export interface ZoneFormData {
  id: string
  name: string
  fee: number
  active: boolean
}

export function ZoneForm({ zone }: { zone?: ZoneFormData }) {
  const close = useContext(CloseContext)
  return (
    <ActionForm action={saveZoneAction} resetOnSuccess={!zone} onSuccess={zone ? close : undefined} className="flex flex-wrap items-start gap-3">
      {(s) => (
        <>
          {zone && <input type="hidden" name="id" value={zone.id} />}
          <Field
            label="Bairro"
            name="name"
            defaultValue={zone?.name}
            placeholder="Ex.: Centro"
            required
            maxLength={60}
            error={s.fieldErrors?.name}
            className="flex-1 min-w-48"
          />
          <Field
            label="Taxa (R$)"
            name="fee"
            inputMode="decimal"
            placeholder="5,00"
            defaultValue={zone ? zone.fee.toFixed(2).replace(".", ",") : ""}
            required
            error={s.fieldErrors?.fee}
            className="w-32"
          />
          <input type="hidden" name="active" value={zone && !zone.active ? "" : "on"} />
          <SubmitButton className="mt-6">{zone ? "Salvar" : "Adicionar"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

export function BulkZonesForm() {
  return (
    <ActionForm action={bulkAddZonesAction} resetOnSuccess className="space-y-3">
      {(s) => (
        <>
          <div>
            <Label htmlFor="zones-bulk" className="mb-1.5">
              Um bairro por linha, com a taxa no final
            </Label>
            <Textarea
              id="zones-bulk"
              name="lines"
              rows={6}
              placeholder={"Centro; 5,00\nJardim América; 7,50\nVila Nova; 0"}
              className="font-mono text-sm"
              aria-invalid={!!s.fieldErrors?.lines}
            />
            {s.fieldErrors?.lines && <p className="text-sm text-destructive mt-1">{s.fieldErrors.lines}</p>}
          </div>
          <SubmitButton variant="outline">Adicionar todos</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
