"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addressLine, formatBRL, formatKm, type AddressParts, type DeliveryConfig, type QuoteView } from "@/lib/order-shared"

/** Campos do endereço por partes (entrega por km). Ficam junto dos outros campos do pedido. */
export type AddressFields = {
  cep: string
  street: string
  number: string
  district: string
  city: string
  state: string
  complement: string
}
export const emptyAddressFields: AddressFields = { cep: "", street: "", number: "", district: "", city: "", state: "", complement: "" }

/** Já dá para calcular? (rua, número, cidade e UF) */
const ready = (v: AddressFields) => v.street.trim().length >= 2 && v.number.trim().length >= 1 && v.city.trim().length >= 2 && /^[A-Za-z]{2}$/.test(v.state.trim())

/** Partes no formato que o servidor valida. */
export function partsFromFields(v: AddressFields): AddressParts {
  const clean = (s: string) => s.trim().replace(/\s+/g, " ")
  return {
    cep: v.cep.replace(/\D/g, "") || null,
    street: clean(v.street),
    number: clean(v.number),
    district: clean(v.district) || null,
    city: clean(v.city),
    state: clean(v.state).toUpperCase(),
    complement: clean(v.complement) || null,
  }
}

export const addressText = (v: AddressFields) => (ready(v) ? addressLine(partsFromFields(v)) : "")

/**
 * Calcula a entrega enquanto o cliente digita (espera ele parar 0,7 s). O complemento não muda a distância,
 * então não dispara nova consulta. fee = null enquanto não tiver um cálculo válido para o endereço atual.
 */
export function useDistanceQuote(active: boolean, v: AddressFields, quoteFn: (parts: AddressParts) => Promise<QuoteView>) {
  const parts = partsFromFields(v)
  const key = active && ready(v) ? JSON.stringify({ ...parts, complement: null, cep: null }) : ""
  const [state, setState] = useState<{ key: string; quote: QuoteView | null }>({ key: "", quote: null })
  const fnRef = useRef(quoteFn)
  fnRef.current = quoteFn

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const t = setTimeout(async () => {
      const q = await fnRef.current(JSON.parse(key)).catch((): QuoteView => ({ ok: false, error: "Não foi possível calcular a entrega agora." }))
      if (!cancelled) setState({ key, quote: q })
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key])

  const quote = key && state.key === key ? state.quote : null
  return { quote, loading: !!key && state.key !== key, fee: quote?.ok ? quote.fee : null }
}

const maskCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function DistanceAddress({
  value,
  onChange,
  delivery,
  quote,
  loading,
  errors = {},
  disabled,
}: {
  value: AddressFields
  onChange: (patch: Partial<AddressFields>) => void
  delivery: DeliveryConfig
  quote: QuoteView | null
  loading: boolean
  errors?: Record<string, string | undefined>
  disabled?: boolean
}) {
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "notfound">("idle")
  const numberRef = useRef<HTMLInputElement>(null)
  const lastCep = useRef("")

  // Sem cidade ainda: sugere a da loja (a maioria dos pedidos é da mesma cidade)
  useEffect(() => {
    if (!value.city && !value.state && delivery.city) onChange({ city: delivery.city, state: delivery.state })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // CEP completo → ViaCEP (grátis, direto do navegador) preenche rua, bairro e cidade
  const onCep = async (raw: string) => {
    const cep = maskCep(raw)
    onChange({ cep })
    const digits = cep.replace(/\D/g, "")
    if (digits.length !== 8 || digits === lastCep.current) return
    lastCep.current = digits
    setCepStatus("loading")
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(6000) })
      const j = await res.json()
      if (j.erro) throw new Error("cep")
      onChange({
        cep,
        street: j.logradouro || value.street,
        district: j.bairro || value.district,
        city: j.localidade || value.city,
        state: j.uf || value.state,
      })
      setCepStatus("idle")
      if (j.logradouro) numberRef.current?.focus()
    } catch {
      setCepStatus("notfound")
    }
  }

  const input = "h-11 text-base"
  const field = (name: keyof AddressFields, label: string, props: React.ComponentProps<typeof Input> = {}, className = "") => (
    <div className={className}>
      <Label htmlFor={`addr-${name}`} className="mb-1.5">
        {label}
      </Label>
      <Input
        id={`addr-${name}`}
        value={value[name]}
        onChange={(e) => onChange({ [name]: e.target.value })}
        disabled={disabled}
        className={input}
        aria-invalid={!!errors[name]}
        {...props}
      />
      {errors[name] && <p className="mt-1 text-sm text-destructive">{errors[name]}</p>}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div>
          <Label htmlFor="addr-cep" className="mb-1.5">
            CEP
          </Label>
          <Input
            id="addr-cep"
            value={value.cep}
            onChange={(e) => onCep(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
            disabled={disabled}
            className={`${input} max-w-40`}
            aria-describedby="addr-cep-hint"
          />
        </div>
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
          className="pb-3 text-xs text-muted-foreground underline underline-offset-2"
        >
          Não sei o CEP
        </a>
      </div>
      <p id="addr-cep-hint" className="-mt-1 text-xs text-muted-foreground" role="status">
        {cepStatus === "loading" ? "Buscando o CEP…" : cepStatus === "notfound" ? "CEP não encontrado. Preencha a rua abaixo." : "Com o CEP, a rua e o bairro se preenchem sozinhos."}
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        {field("street", "Rua *", { autoComplete: "address-line1", maxLength: 120 })}
        {field("number", "Número *", { ref: numberRef, inputMode: "text", maxLength: 10, placeholder: "ou s/n" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("district", "Bairro", { maxLength: 80 })}
        {field("complement", "Complemento / referência", { maxLength: 120, placeholder: "Apto, bloco, ponto de referência" })}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
        {field("city", "Cidade *", { autoComplete: "address-level2", maxLength: 80 })}
        {field("state", "UF *", { autoComplete: "address-level1", maxLength: 2, className: `${input} uppercase` })}
      </div>

      <div
        role="status"
        className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
          quote && !quote.ok ? "bg-destructive/10 text-destructive" : quote?.ok ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200" : "bg-muted text-muted-foreground"
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
            Calculando a entrega…
          </>
        ) : quote?.ok ? (
          <>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Cerca de <strong>{formatKm(quote.km)}</strong> da loja · entrega <strong>{quote.fee > 0 ? formatBRL(quote.fee) : "grátis"}</strong>
              {!quote.precise && <span className="block text-xs opacity-80">Distância estimada pela rua (o número não aparece no mapa).</span>}
            </span>
          </>
        ) : quote ? (
          <span>{quote.error}</span>
        ) : (
          <span>Preencha rua, número e cidade para calcular a taxa de entrega.</span>
        )}
      </div>
    </div>
  )
}
