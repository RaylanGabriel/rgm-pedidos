"use client"

import { useState } from "react"
import { KeyRound, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { slugify } from "@/lib/slug"
import { createStoreAction, resetPasswordAction, suspendStoreAction } from "./actions"

export function NewStoreForm({ siteUrl }: { siteUrl: string }) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const shownSlug = slugEdited ? slug : slugify(name)

  return (
    <ActionForm
      action={createStoreAction}
      resetOnSuccess
      onSuccess={() => {
        setName("")
        setSlug("")
        setSlugEdited(false)
      }}
      className="space-y-4"
    >
      {(s) => (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Nome da loja"
              name="storeName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dogão do Zé"
              maxLength={60}
              required
              error={s.fieldErrors?.storeName}
            />
            <Field
              label="Endereço do cardápio"
              name="slug"
              value={shownSlug}
              onChange={(e) => {
                setSlugEdited(true)
                setSlug(e.target.value.toLowerCase())
              }}
              placeholder="dogao-do-ze"
              maxLength={40}
              required
              hint={`${siteUrl}/loja/${shownSlug || "…"}`}
              error={s.fieldErrors?.slug}
            />
            <Field label="Nome do dono" name="ownerName" placeholder="José da Silva" maxLength={100} required error={s.fieldErrors?.ownerName} />
            <Field
              label="E-mail do dono"
              name="ownerEmail"
              type="email"
              placeholder="ze@email.com"
              maxLength={255}
              autoComplete="off"
              required
              hint="Se já tiver conta, só é vinculado à loja nova."
              error={s.fieldErrors?.ownerEmail}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" name="starter" defaultChecked className="h-4 w-4 accent-[var(--primary)]" />
            Criar categorias iniciais (Lanches, Porções, Bebidas, Sobremesas)
          </label>
          <SubmitButton>Criar loja</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

const REASON_SUGGESTIONS = ["Pagamento em atraso", "Contrato encerrado", "Loja em manutenção", "Solicitado pelo dono"]

/** Botão "Suspender" que abre um campo para escrever o motivo (mostrado ao dono). */
export function SuspendForm({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const listId = `motivos-${storeId}`

  if (!open)
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Power className="w-4 h-4" />
        Suspender
      </Button>
    )

  return (
    <ActionForm action={suspendStoreAction} onSuccess={() => setOpen(false)} className="w-full sm:w-80 space-y-2 rounded-lg border-2 border-destructive/40 p-3">
      {(s) => (
        <>
          <input type="hidden" name="storeId" value={storeId} />
          <Field
            label={`Motivo da suspensão de ${storeName}`}
            name="reason"
            list={listId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: Pagamento em atraso"
            maxLength={300}
            required
            autoFocus
            hint="Aparece para o dono e a equipe ao abrir o painel."
            error={s.fieldErrors?.reason}
          />
          <datalist id={listId}>
            {REASON_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">O cardápio sai do ar e a loja para de receber pedidos.</p>
          <div className="flex gap-2">
            <SubmitButton size="sm" variant="destructive">
              Suspender loja
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  )
}

export function ResetPasswordForm({ userId, label }: { userId: string; label: string }) {
  return (
    <ActionForm action={resetPasswordAction}>
      {() => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <SubmitButton
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              if (!confirm(`Gerar uma nova senha provisória para ${label}? A senha atual deixa de funcionar.`)) e.preventDefault()
            }}
          >
            <KeyRound className="w-3 h-3" />
            Nova senha
          </SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
