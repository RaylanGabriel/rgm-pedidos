"use client"

import { Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  deliveryAvailable,
  cleanName,
  formatBRL,
  maskPhone,
  parseMoneyBR,
  PAYMENT_LABEL,
  TYPE_LABEL,
  type DeliveryConfig,
  type OrderType,
  type PaymentMethod,
  type QuoteView,
} from "@/lib/order-shared"
import { DistanceAddress, emptyAddressFields, type AddressFields } from "@/components/order/distance-address"

export interface OrderFieldsValue {
  customerName: string
  customerPhone: string
  type: OrderType
  deliveryAddress: string
  deliveryZoneId: string
  /** Entrega por km: endereço por partes (CEP, rua, número…) */
  address: AddressFields
  paymentMethod: PaymentMethod
  /** "Troco para" (texto digitado; só vale em dinheiro) */
  changeFor: string
  notes: string
}

export const emptyOrderFields: OrderFieldsValue = {
  customerName: "",
  customerPhone: "",
  type: "pickup",
  deliveryAddress: "",
  deliveryZoneId: "",
  address: emptyAddressFields,
  paymentMethod: "pix",
  changeFor: "",
  notes: "",
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive dark:bg-input/30"

/** Grupo de opções em botões (melhor que lista quando são poucas: tudo fica visível). */
function Choice<T extends string>({
  name,
  value,
  options,
  hints = {},
  onChange,
  disabled,
  label,
}: {
  name: string
  value: T
  options: Record<T, string>
  hints?: Partial<Record<T, string>>
  onChange: (v: T) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {(Object.keys(options) as T[]).map((opt) => {
        const on = value === opt
        return (
          <label
            key={opt}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
              on ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"
            }`}
          >
            <input type="radio" name={name} value={opt} checked={on} onChange={() => onChange(opt)} disabled={disabled} className="sr-only" />
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              }`}
              aria-hidden
            >
              {on && <Check className="h-3 w-3" strokeWidth={3.5} />}
            </span>
            <span>
              {options[opt]}
              {hints[opt] && <span className="block text-xs font-normal text-muted-foreground">{hints[opt]}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-base font-bold">{title}</legend>
      {children}
    </fieldset>
  )
}

/** Campos do pedido em blocos: como vai receber (define a taxa) → seus dados → pagamento → observações. */
export function OrderFields({
  value,
  onChange,
  errors = {},
  disabled,
  phoneRequired,
  delivery,
  total,
  pixOnline = false,
  quote = null,
  quoteLoading = false,
}: {
  value: OrderFieldsValue
  onChange: (v: OrderFieldsValue) => void
  errors?: Record<string, string | undefined>
  disabled?: boolean
  phoneRequired?: boolean
  delivery: DeliveryConfig
  /** Total previsto do pedido (para calcular o troco) */
  total?: number
  /** Loja aceita Pix pelo site (Mercado Pago conectado) */
  pixOnline?: boolean
  /** Entrega por km: cálculo da taxa para o endereço digitado (useDistanceQuote) */
  quote?: QuoteView | null
  quoteLoading?: boolean
}) {
  const canDeliver = deliveryAvailable(delivery)
  const typeLabels = canDeliver
    ? TYPE_LABEL
    : (Object.fromEntries(Object.entries(TYPE_LABEL).filter(([k]) => k !== "delivery")) as Record<OrderType, string>)
  const typeHints: Partial<Record<OrderType, string>> = {}
  if (canDeliver) {
    const minZone = Math.min(...delivery.zones.map((z) => z.fee))
    const minTier = Math.min(...delivery.tiers.map((t) => t.fee))
    typeHints.delivery =
      delivery.pricing === "distance"
        ? minTier > 0
          ? `a partir de ${formatBRL(minTier)}`
          : "conforme a distância"
        : delivery.pricing === "fixed"
        ? delivery.fixedFee > 0
          ? `+ ${formatBRL(delivery.fixedFee)}`
          : "grátis"
        : minZone > 0
          ? `a partir de ${formatBRL(minZone)}`
          : "conforme o bairro"
  }
  const set = <K extends keyof OrderFieldsValue>(k: K, v: OrderFieldsValue[K]) => onChange({ ...value, [k]: v })
  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-error`} className="mt-1 text-sm text-destructive">
        {errors[k]}
      </p>
    ) : null
  const input = "h-11 text-base"
  // Poucos bairros: botões (mostram tudo de uma vez); muitos: lista
  const zonesAsButtons = delivery.zones.length > 0 && delivery.zones.length <= 6

  return (
    <div className="space-y-8">
      <Section title="Como você quer receber?">
        <Choice label="Como vai receber" name="type" value={value.type} options={typeLabels} hints={typeHints} onChange={(v) => set("type", v)} disabled={disabled} />
        {!canDeliver && <p className="text-sm text-muted-foreground">Esta loja não está fazendo entregas no momento.</p>}
        {canDeliver && value.type === "delivery" && delivery.minOrder > 0 && (
          <p className="text-sm text-muted-foreground">Pedido mínimo para entrega: {formatBRL(delivery.minOrder)}</p>
        )}

        {value.type === "delivery" && delivery.pricing === "zones" && (
          <div>
            <Label htmlFor="deliveryZoneId" className="mb-2">
              Bairro *
            </Label>
            {zonesAsButtons ? (
              <Choice
                label="Bairro"
                name="deliveryZoneId"
                value={value.deliveryZoneId}
                options={Object.fromEntries(delivery.zones.map((z) => [z.id, z.name]))}
                hints={Object.fromEntries(delivery.zones.map((z) => [z.id, z.fee > 0 ? formatBRL(z.fee) : "grátis"]))}
                onChange={(v) => set("deliveryZoneId", v)}
                disabled={disabled}
              />
            ) : (
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
            )}
            {errors.deliveryZoneId ? (
              err("deliveryZoneId")
            ) : (
              <p id="deliveryZoneId-hint" className="mt-2 text-xs text-muted-foreground">
                Não achou seu bairro? A loja ainda não entrega aí: escolha retirada.
              </p>
            )}
          </div>
        )}

        {value.type === "delivery" && delivery.pricing === "distance" && (
          <DistanceAddress
            value={value.address}
            onChange={(patch) => onChange({ ...value, address: { ...value.address, ...patch } })}
            delivery={delivery}
            quote={quote}
            loading={quoteLoading}
            errors={errors}
            disabled={disabled}
          />
        )}

        {value.type === "delivery" && delivery.pricing !== "distance" && (
          <div>
            <Label htmlFor="deliveryAddress" className="mb-1.5">
              Endereço de entrega *
            </Label>
            <Textarea
              id="deliveryAddress"
              rows={2}
              value={value.deliveryAddress}
              onChange={(e) => set("deliveryAddress", e.target.value)}
              maxLength={300}
              autoComplete="street-address"
              placeholder={delivery.pricing === "zones" ? "Rua, número, complemento e ponto de referência" : "Rua, número, bairro e ponto de referência"}
              disabled={disabled}
              className="text-base"
              aria-invalid={!!errors.deliveryAddress}
              aria-describedby={errors.deliveryAddress ? "deliveryAddress-error" : undefined}
            />
            {err("deliveryAddress")}
          </div>
        )}
      </Section>

      <Section title="Seus dados">
        <div>
          <Label htmlFor="customerName" className="mb-1.5">
            Nome *
          </Label>
          <Input
            id="customerName"
            value={value.customerName}
            onChange={(e) => set("customerName", cleanName(e.target.value))}
            maxLength={100}
            autoComplete="name"
            placeholder="Como chamamos você no balcão"
            required
            disabled={disabled}
            className={input}
            aria-invalid={!!errors.customerName}
            aria-describedby={errors.customerName ? "customerName-error" : undefined}
          />
          {err("customerName")}
        </div>
        <div>
          <Label htmlFor="customerPhone" className="mb-1.5">
            WhatsApp{phoneRequired ? " *" : <span className="font-normal text-muted-foreground"> (opcional)</span>}
          </Label>
          <Input
            id="customerPhone"
            type="tel"
            inputMode="tel"
            placeholder="(42) 99999-9999"
            value={maskPhone(value.customerPhone)}
            onChange={(e) => set("customerPhone", maskPhone(e.target.value))}
            maxLength={16}
            autoComplete="tel"
            required={phoneRequired}
            disabled={disabled}
            className={input}
            aria-invalid={!!errors.customerPhone}
            aria-describedby={errors.customerPhone ? "customerPhone-error" : "customerPhone-hint"}
          />
          {errors.customerPhone ? (
            err("customerPhone")
          ) : (
            <p id="customerPhone-hint" className="mt-1 text-xs text-muted-foreground">
              Para a loja falar com você se precisar.
            </p>
          )}
        </div>
      </Section>

      <Section title="Pagamento">
        <Choice
          label="Forma de pagamento"
          name="paymentMethod"
          value={value.paymentMethod}
          options={PAYMENT_LABEL}
          onChange={(v) => set("paymentMethod", v)}
          disabled={disabled}
        />
        {value.paymentMethod === "cash" && <ChangeField value={value.changeFor} total={total} error={errors.changeFor} disabled={disabled} onChange={(v) => set("changeFor", v)} />}
        <p className="text-xs text-muted-foreground">
          {pixOnline && value.paymentMethod === "pix"
            ? "Na próxima tela aparece o Pix (copia e cola ou QR code). Seu pedido vai para a cozinha assim que o pagamento cair."
            : "O pagamento é feito direto com a loja."}
        </p>
      </Section>

      <Section title="Observações">
        <Textarea
          id="notes"
          aria-label="Observações"
          rows={3}
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={500}
          placeholder="Ex.: ponto da carne, molho à parte… (opcional)"
          disabled={disabled}
          className="text-base"
          aria-invalid={!!errors.notes}
        />
        {err("notes")}
      </Section>
    </div>
  )
}

/** "Troco para quanto?" — atalhos com as notas mais comuns acima do total + campo livre. */
function ChangeField({
  value,
  total,
  error,
  disabled,
  onChange,
}: {
  value: string
  total?: number
  error?: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  const amount = parseMoneyBR(value)
  const notes = total ? [10, 20, 50, 100, 200].filter((n) => n > total).slice(0, 3) : []
  const tooLow = amount !== null && total !== undefined && amount <= total
  const back = amount !== null && total !== undefined && amount > total ? amount - total : null
  const chip = (active: boolean) =>
    `h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "bg-background hover:border-primary"}`
  return (
    <div className="space-y-2 rounded-xl border border-dashed p-3">
      <Label htmlFor="changeFor" className="text-sm font-semibold">
        Precisa de troco?
      </Label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip(value === "")} aria-pressed={value === ""} disabled={disabled} onClick={() => onChange("")}>
          Não preciso
        </button>
        {notes.map((n) => (
          <button key={n} type="button" className={chip(amount === n)} aria-pressed={amount === n} disabled={disabled} onClick={() => onChange(String(n))}>
            Para {formatBRL(n).replace(",00", "")}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Troco para R$</span>
        <Input
          id="changeFor"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="outro valor"
          maxLength={10}
          disabled={disabled}
          className="h-10 w-32 text-base"
          aria-invalid={tooLow || !!error}
          aria-describedby="changeFor-hint"
        />
      </div>
      <p id="changeFor-hint" className={`text-xs ${tooLow || error ? "text-destructive" : "text-muted-foreground"}`} role={tooLow ? "alert" : undefined}>
        {error ?? (tooLow ? `O valor precisa ser maior que o total (${formatBRL(total!)}).` : back !== null ? `A loja vai levar ${formatBRL(back)} de troco.` : "Deixe em branco se for pagar o valor exato.")}
      </p>
    </div>
  )
}
