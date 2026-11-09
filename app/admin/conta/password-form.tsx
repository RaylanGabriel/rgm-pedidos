"use client"

import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { changePasswordAction } from "./actions"

export function PasswordForm({ email }: { email: string }) {
  return (
    <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-4">
      {(s) => (
        <>
          {/* ajuda o gerenciador de senhas do navegador a salvar a senha certa */}
          <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
          <Field label="Senha atual" name="current" type="password" autoComplete="current-password" required error={s.fieldErrors?.current} />
          <Field
            label="Nova senha"
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            hint="Mínimo de 8 caracteres."
            error={s.fieldErrors?.next}
          />
          <Field label="Repita a nova senha" name="confirm" type="password" autoComplete="new-password" required error={s.fieldErrors?.confirm} />
          <SubmitButton>Trocar senha</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
