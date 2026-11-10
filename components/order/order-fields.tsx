"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  deliveryAvailable,
  formatBRL,
  PAYMENT_LABEL,
  TYPE_LABEL,
  type DeliveryConfig,
  type OrderType,
  type PaymentMethod,
} from "@/lib/order-shared"

export interface OrderFieldsValue {
  customerName: string
  customerPhone: string
  type: OrderType
  deliveryAddress: string
  deliveryZoneId: string
  paymentMethod: PaymentMethod
  notes: string
}

export const emptyOrderFields: OrderFieldsValue = {
  customerName: "",
  customerPhone: "",
  type: "pickup",
  deliveryAddress: "",
  deliveryZoneId: "",
  paymentMethod: "pix",
  notes: "",
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive dark:bg-input/30"

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
  delivery,
}: {
  value: OrderFieldsValue
  onChange: (v: OrderFieldsValue) => void
  errors?: Record<string, string | undefined>
  disabled?: boolean
  phoneRequired?: boolean
  delivery: DeliveryConfig
}) {
  const canDeliver = deliveryAvailable(delivery)
  const typeOptions = canDeliver
    ? TYPE_LABEL
    : (Object.fromEntries(Object.entries(TYPE_LABEL).filter(([k]) => k !== "delivery")) as Record<OrderType, string>)
  const typeLabels = { ...typeOptions }
  if (canDeliver && delivery.pricing === "fixed" && delivery.fixedFee > 0) typeLabels.delivery = `Entrega (+ ${formatBRL(delivery.fixedFee)})`
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
        <Choice name="type" value={value.type} options={typeLabels} onChange={(v) => set("type", v)} disabled={disabled} />
        {!canDeliver && <p className="text-xs text-muted-foreground mt-2">Esta loja não está fazendo entregas no momento.</p>}
        {canDeliver && value.type === "delivery" && delivery.minOrder > 0 && (
          <p className="text-xs text-muted-foreground mt-2">Pedido mínimo para entrega: {formatBRL(delivery.minOrder)}</p>
        )}
      </div>

      {value.type === "delivery" && delivery.pricing === "zones" && (
        <div>
          <Label htmlFor="deliveryZoneId">Bairro *</Label>
          <select
            id="deliveryZoneId"
            value={value.deliveryZoneId}
            onChange={(e) => set("deliveryZoneId", e.target.value)}
            required
            disabled={disabled}
            className={selectClass}
            aria-invalid={!!errors.deliveryZoneId}
            aria-describedby={errors.deliveryZoneId ? "deliveryZoneId-error" : "deliveryZoneId-hint"}
          >
            <option value="">Selecione o seu bairro</option>
            {delivery.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} — {z.fee > 0 ? formatBRL(z.fee) : "grátis"}
              </option>
            ))}
          </select>
          {errors.deliveryZoneId ? (
            err("deliveryZoneId")
          ) : (
            <p id="deliveryZoneId-hint" className="text-xs text-muted-foreground mt-1">
              Não achou seu bairro? A loja ainda não entrega aí: escolha retirada.
            </p>
          )}
        </div>
      )}

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
            placeholder={delivery.pricing === "zones" ? "Rua, número, complemento e ponto de referência" : "Rua, número, bairro e ponto de referência"}
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
