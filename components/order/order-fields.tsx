"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PAYMENT_LABEL, TYPE_LABEL, type OrderType, type PaymentMethod } from "@/lib/order-shared"

export interface OrderFieldsValue {
  customerName: string
  customerPhone: string
  type: OrderType
  deliveryAddress: string
  paymentMethod: PaymentMethod
  notes: string
}

export const emptyOrderFields: OrderFieldsValue = {
  customerName: "",
  customerPhone: "",
  type: "pickup",
  deliveryAddress: "",
  paymentMethod: "pix",
  notes: "",
}

function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string
  value: T
  options: Record<T, string>
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {(Object.keys(options) as T[]).map((opt) => (
        <label
          key={opt}
          className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
            value === opt ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            disabled={disabled}
            className="sr-only"
          />
          {options[opt]}
        </label>
      ))}
    </div>
  )
}

/** Campos de dados do pedido (cliente, tipo, pagamento, observações). */
export function OrderFields({
  value,
  onChange,
  errors = {},
  disabled,
  phoneRequired,
}: {
  value: OrderFieldsValue
  onChange: (v: OrderFieldsValue) => void
  errors?: Record<string, string | undefined>
  disabled?: boolean
  phoneRequired?: boolean
}) {
  const set = <K extends keyof OrderFieldsValue>(k: K, v: OrderFieldsValue[K]) => onChange({ ...value, [k]: v })
  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-error`} className="text-sm text-destructive mt-1">
        {errors[k]}
      </p>
    ) : null

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="customerName">Nome *</Label>
        <Input
          id="customerName"
          value={value.customerName}
          onChange={(e) => set("customerName", e.target.value)}
          maxLength={100}
          autoComplete="name"
          required
          disabled={disabled}
          aria-invalid={!!errors.customerName}
          aria-describedby={errors.customerName ? "customerName-error" : undefined}
        />
        {err("customerName")}
      </div>

      <div>
        <Label htmlFor="customerPhone">WhatsApp{phoneRequired ? " *" : " (opcional)"}</Label>
        <Input
          id="customerPhone"
          type="tel"
          inputMode="tel"
          placeholder="(11) 98765-4321"
          value={value.customerPhone}
          onChange={(e) => set("customerPhone", e.target.value)}
          maxLength={20}
          autoComplete="tel"
          required={phoneRequired}
          disabled={disabled}
          aria-invalid={!!errors.customerPhone}
          aria-describedby={errors.customerPhone ? "customerPhone-error" : undefined}
        />
        {err("customerPhone")}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Como vai receber?</p>
        <Choice name="type" value={value.type} options={TYPE_LABEL} onChange={(v) => set("type", v)} disabled={disabled} />
      </div>

      {value.type === "delivery" && (
        <div>
          <Label htmlFor="deliveryAddress">Endereço de entrega *</Label>
          <Textarea
            id="deliveryAddress"
            rows={2}
            value={value.deliveryAddress}
            onChange={(e) => set("deliveryAddress", e.target.value)}
            maxLength={300}
            autoComplete="street-address"
            placeholder="Rua, número, bairro e ponto de referência"
            disabled={disabled}
            aria-invalid={!!errors.deliveryAddress}
            aria-describedby={errors.deliveryAddress ? "deliveryAddress-error" : undefined}
          />
          {err("deliveryAddress")}
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-2">Pagamento</p>
        <Choice name="paymentMethod" value={value.paymentMethod} options={PAYMENT_LABEL} onChange={(v) => set("paymentMethod", v)} disabled={disabled} />
      </div>

      <div>
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          rows={3}
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={500}
          placeholder="Ex.: sem cebola, ponto da carne… (opcional)"
          disabled={disabled}
          aria-invalid={!!errors.notes}
        />
        {err("notes")}
      </div>
    </div>
  )
}
