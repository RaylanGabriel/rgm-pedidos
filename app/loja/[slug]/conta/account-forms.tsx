"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { requestCodeAction, saveAddressAction, saveProfileAction, verifyCodeAction } from "./actions"

/** Logo do Google (cores oficiais), para o botão "Continuar com Google". */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

/**
 * Entrar: "Continuar com Google" ou e-mail → código de 6 dígitos. Sem senha.
 * `notice`: aviso vindo da volta do Google (?entrar=cancelado|erro).
 */
export function LoginPanel({ slug, google, email: emailEnabled, notice }: { slug: string; google: boolean; email: boolean; notice?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState(notice === "erro" ? "Não deu para entrar com o Google. Tente de novo ou use o e-mail." : "")
  const [pending, start] = useTransition()

  const send = () =>
    start(async () => {
      setError("")
      const r = await requestCodeAction(slug, email)
      if ("error" in r) setError(r.error)
      else {
        setEmail(r.email)
        setStep("code")
      }
    })
  const verify = () =>
    start(async () => {
      setError("")
      const r = await verifyCodeAction(email, code)
      if ("error" in r) setError(r.error)
      else router.refresh()
    })

  return (
    <div className="space-y-5">
      {google && (
        <>
          <a
            href="/auth/cliente/google"
            // volta para esta mesma página depois de entrar (o endereço só existe no navegador)
            onClick={(e) => (e.currentTarget.href = `/auth/cliente/google?volta=${encodeURIComponent(window.location.href)}`)}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border-2 bg-card font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GoogleLogo />
            Continuar com Google
          </a>
          {emailEnabled && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou com seu e-mail
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
        </>
      )}

      {emailEnabled &&
        (step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
            className="space-y-3"
          >
            <div>
              <Label htmlFor="login-email" className="mb-1.5">
                E-mail
              </Label>
              <Input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
            </div>
            <Button type="submit" size="lg" className="h-12 w-full rounded-full" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Receber código por e-mail
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              verify()
            }}
            className="space-y-3"
          >
            <p className="text-sm">
              Mandamos um código de 6 números para <strong>{email}</strong>. Ele vale por 10 minutos.
            </p>
            <div>
              <Label htmlFor="login-code" className="mb-1.5">
                Código
              </Label>
              <Input
                id="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl font-bold tracking-[0.4em]"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 w-full rounded-full" disabled={pending || code.length !== 6}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => (setStep("email"), setCode(""), setError(""))}>
                Trocar e-mail
              </button>
              <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" disabled={pending} onClick={send}>
                Mandar outro código
              </button>
            </div>
          </form>
        ))}

      {!google && !emailEnabled && <p className="text-sm text-muted-foreground">Entrar ainda não está disponível. Você pode pedir normalmente, sem conta.</p>}
      {notice === "cancelado" && !error && <p className="text-sm text-muted-foreground">Entrada com o Google cancelada.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function ProfileForm({ name, phone }: { name: string | null; phone: string | null }) {
  return (
    <ActionForm action={saveProfileAction} className="space-y-4">
      {(s) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="name" defaultValue={name ?? ""} required maxLength={80} autoComplete="name" error={s.fieldErrors?.name} />
            <Field
              label="WhatsApp (com DDD)"
              name="phone"
              defaultValue={phone ?? ""}
              inputMode="tel"
              autoComplete="tel"
              placeholder="(42) 99999-9999"
              error={s.fieldErrors?.phone}
            />
          </div>
          <SubmitButton>Salvar dados</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

export interface AddressValue {
  id: string
  label: string | null
  cep: string | null
  street: string
  number: string | null
  district: string | null
  city: string | null
  state: string | null
  complement: string | null
}

/** Novo endereço (sem `address`) ou editar um salvo. O CEP preenche rua/bairro/cidade (ViaCEP). */
export function AddressForm({ address, onDone }: { address?: AddressValue; onDone?: () => void }) {
  const [v, setV] = useState({
    label: address?.label ?? "",
    cep: address?.cep ?? "",
    street: address?.street ?? "",
    number: address?.number ?? "",
    district: address?.district ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    complement: address?.complement ?? "",
  })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }))
  const lookupCep = async (raw: string) => {
    const cep = raw.replace(/\D/g, "")
    if (cep.length !== 8) return
    try {
      const r = (await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json()) as Record<string, string> & { erro?: boolean }
      if (!r.erro) setV((p) => ({ ...p, street: p.street || r.logradouro, district: p.district || r.bairro, city: r.localidade, state: r.uf }))
    } catch {}
  }
  return (
    <ActionForm
      action={saveAddressAction}
      resetOnSuccess={!address}
      onSuccess={() => {
        if (!address) setV({ label: "", cep: "", street: "", number: "", district: "", city: "", state: "", complement: "" })
        onDone?.()
      }}
      className="space-y-3"
    >
      {(s) => (
        <>
          {address && <input type="hidden" name="id" value={address.id} />}
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
            <Field label="Apelido" name="label" value={v.label} onChange={set("label")} placeholder="Casa, Trabalho…" maxLength={30} />
            <Field label="CEP" name="cep" value={v.cep} onChange={set("cep")} onBlur={(e) => lookupCep(e.target.value)} inputMode="numeric" maxLength={9} error={s.fieldErrors?.cep} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <Field label="Rua" name="street" value={v.street} onChange={set("street")} required maxLength={120} autoComplete="address-line1" error={s.fieldErrors?.street} />
            <Field label="Número" name="number" value={v.number} onChange={set("number")} maxLength={20} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem] gap-3">
            <Field label="Bairro" name="district" value={v.district} onChange={set("district")} maxLength={60} />
            <Field label="Cidade" name="city" value={v.city} onChange={set("city")} maxLength={60} />
            <Field label="UF" name="state" value={v.state} onChange={set("state")} maxLength={2} />
          </div>
          <Field label="Complemento" name="complement" value={v.complement} onChange={set("complement")} placeholder="Apto, bloco, referência…" maxLength={80} />
          <SubmitButton>{address ? "Salvar endereço" : "Adicionar endereço"}</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
