"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { ImageInput } from "@/components/admin/image-input"
import { brandStyle, isHexColor, textContrast } from "@/lib/color"
import { saveSettingsAction } from "./actions"

export interface SettingsValues {
  name: string
  phone: string | null
  logoUrl: string | null
  primaryColor: string
  avgPrepMinutes: number
}

const formatPhone = (digits: string | null) => {
  if (!digits) return ""
  const d = digits.replace(/^55(?=\d{10,11}$)/, "")
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : digits
}

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [color, setColor] = useState(values.primaryColor)
  const valid = isHexColor(color)
  const lowContrast = valid && textContrast(color) < 4.5

  return (
    <ActionForm action={saveSettingsAction} className="space-y-5">
      {(s) => (
        <>
          <Field label="Nome da loja" name="name" defaultValue={values.name} required maxLength={60} error={s.fieldErrors?.name} />

          <Field
            label="WhatsApp da loja"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="(11) 98765-4321"
            defaultValue={formatPhone(values.phone)}
            maxLength={20}
            error={s.fieldErrors?.phone}
            hint="Aparece no rodapé do cardápio para o cliente tirar dúvidas"
          />

          <Field
            label="Tempo médio de preparo (minutos)"
            name="avgPrepMinutes"
            type="number"
            min={1}
            max={120}
            defaultValue={values.avgPrepMinutes}
            required
            error={s.fieldErrors?.avgPrepMinutes}
            hint="A estimativa para o cliente soma 3 min para cada pedido já na fila"
          />

          <ImageInput
            label="Logo"
            name="logo"
            removeName="removeLogo"
            currentUrl={values.logoUrl}
            aspect="aspect-square"
            hint="De preferência quadrada, com fundo transparente ou branco."
            error={s.fieldErrors?.logo}
          />

          <div>
            <Label htmlFor="primaryColor-text" className="mb-1.5">
              Cor principal
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="Escolher cor"
                value={valid ? color : "#000000"}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <Input
                id="primaryColor-text"
                name="primaryColor"
                value={color}
                onChange={(e) => setColor(e.target.value.trim())}
                maxLength={7}
                className="w-32 font-mono"
                aria-invalid={!valid || !!s.fieldErrors?.primaryColor}
              />
              {/* Prévia com a cor escolhida */}
              <span style={brandStyle(valid ? color : null)} className="inline-flex">
                <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Botão de exemplo</span>
              </span>
            </div>
            {(!valid || s.fieldErrors?.primaryColor) && <p className="text-sm text-destructive mt-1">Use o formato #rrggbb (ex.: #c2410c)</p>}
            {lowContrast && (
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Essa cor deixa o texto dos botões difícil de ler. Prefira um tom mais escuro ou mais claro.
              </p>
            )}
          </div>

          <SubmitButton>Salvar configurações</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
