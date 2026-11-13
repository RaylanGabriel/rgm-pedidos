"use client"

import { KeyRound, UserMinus } from "lucide-react"
import { ActionForm, Field, SubmitButton } from "@/components/admin/form-ui"
import { addStaffAction, removeStaffAction, resetStaffPasswordAction } from "./actions"

export function AddStaffForm() {
  return (
    <ActionForm action={addStaffAction} resetOnSuccess className="space-y-4">
      {(s) => (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nome" name="name" placeholder="Maria Souza" maxLength={100} required autoComplete="off" error={s.fieldErrors?.name} />
            <Field
              label="E-mail"
              name="email"
              type="email"
              placeholder="maria@email.com"
              maxLength={255}
              required
              autoComplete="off"
              hint="É o login da pessoa. Não precisa ser um e-mail que ela use muito."
              error={s.fieldErrors?.email}
            />
          </div>
          <SubmitButton>Adicionar funcionário</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}

/** "Nova senha" e "Remover" de um funcionário. As mensagens (e a senha provisória) aparecem logo abaixo. */
export function StaffActions({ userId, name }: { userId: string; name: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      <ActionForm action={resetStaffPasswordAction} className="w-full sm:w-auto">
        {() => (
          <>
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={(e) => {
                if (!confirm(`Gerar uma nova senha provisória para ${name}? A senha atual deixa de funcionar e os aparelhos dessa pessoa saem do painel.`))
                  e.preventDefault()
              }}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Nova senha
            </SubmitButton>
          </>
        )}
      </ActionForm>
      <ActionForm action={removeStaffAction} className="w-full sm:w-auto">
        {() => (
          <>
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-destructive hover:text-destructive"
              onClick={(e) => {
                if (!confirm(`Remover o acesso de ${name}? A pessoa sai do painel na hora.`)) e.preventDefault()
              }}
            >
              <UserMinus className="w-3.5 h-3.5" />
              Remover
            </SubmitButton>
          </>
        )}
      </ActionForm>
    </div>
  )
}
