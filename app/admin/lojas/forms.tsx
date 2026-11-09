"use client"

import { useState } from "react"
import { KeyRound } from "lucide-react"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { slugify } from "@/lib/slug"
import { createStoreAction, resetPasswordAction } from "./actions"

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
