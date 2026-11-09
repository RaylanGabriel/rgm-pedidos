"use client"

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FormState } from "@/lib/form-state"

type Action = (prev: FormState, fd: FormData) => Promise<FormState>

/**
 * Formulário ligado a uma server action, com mensagens de erro/sucesso.
 * `children` recebe o estado para mostrar erros por campo.
 */
export function ActionForm({
  action,
  children,
  resetOnSuccess,
  onSuccess,
  className,
}: {
  action: Action
  children: (state: FormState) => ReactNode
  resetOnSuccess?: boolean
  onSuccess?: () => void
  className?: string
}) {
  const [state, formAction] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.ok) return
    if (resetOnSuccess) ref.current?.reset()
    onSuccess?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form ref={ref} action={formAction} className={className}>
      {children(state)}
      {state.error && (
        <p role="alert" className="text-sm text-destructive mt-3">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400 mt-3">
          {state.message}
        </p>
      )}
    </form>
  )
}

export function Field({
  label,
  name,
  error,
  hint,
  className,
  ...input
}: {
  label: string
  name: string
  error?: string
  hint?: string
  className?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId()
  const id = input.id ?? autoId
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm text-destructive mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

export function SubmitButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </Button>
  )
}

/** Botão para ações simples (sem formulário de campos), opcionalmente pedindo confirmação. */
export function ActionButton({
  action,
  confirmText,
  children,
  ...props
}: { action: () => Promise<void>; confirmText?: string } & Omit<React.ComponentProps<typeof Button>, "action">) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault()
      }}
    >
      <SubmitButton {...props}>{children}</SubmitButton>
    </form>
  )
}
