"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Janela que sobe de baixo no celular e vira modal centralizado no computador.
 * Fecha no X, no fundo escuro ou no Esc; o foco fica preso dentro (Radix Dialog).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Título só para leitores de tela (o conteúdo já mostra o nome) */
  hideTitle?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          // Foca a própria janela (não o 1º botão): no toque, o contorno de foco num botão parece erro
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement | null)?.focus()
          }}
          className={cn(
            "fixed z-50 inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom duration-300",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:max-h-[88vh]",
            "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-bottom-0",
            className,
          )}
        >
          {/* puxador (só visual) */}
          <div className="absolute left-1/2 top-2 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/80 shadow sm:hidden" aria-hidden />
          <Dialog.Title className={hideTitle ? "sr-only" : "px-5 pt-6 pb-2 text-xl font-bold"}>{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          <Dialog.Close
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md backdrop-blur transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Seletor de quantidade com botões de 44px (alvo de toque confortável). */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  size = "lg",
  label = "quantidade",
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  size?: "sm" | "lg"
  label?: string
}) {
  const btn = size === "lg" ? "h-11 w-11" : "h-9 w-9"
  return (
    <div className={cn("flex items-center rounded-full border bg-background", size === "lg" ? "gap-1 p-0.5" : "gap-0.5")}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={cn(btn, "flex items-center justify-center rounded-full text-lg font-bold text-primary transition hover:bg-primary/10 disabled:text-muted-foreground disabled:hover:bg-transparent")}
        aria-label={`Diminuir ${label}`}
      >
        −
      </button>
      <span className={cn("text-center font-semibold tabular-nums", size === "lg" ? "w-7 text-base" : "w-5 text-sm")} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={cn(btn, "flex items-center justify-center rounded-full text-lg font-bold text-primary transition hover:bg-primary/10 disabled:text-muted-foreground disabled:hover:bg-transparent")}
        aria-label={`Aumentar ${label}`}
      >
        +
      </button>
    </div>
  )
}
