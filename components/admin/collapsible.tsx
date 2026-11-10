"use client"

import { createContext, useState } from "react"

/** Bloco recolhível (abre o formulário de edição/criação). Formulários de edição dentro dele o fecham ao salvar. */
export const CloseContext = createContext<(() => void) | undefined>(undefined)

export function Collapsible({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={className}>
      <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:underline w-fit">{summary}</summary>
      {open && (
        <CloseContext.Provider value={() => setOpen(false)}>
          <div className="pt-4">{children}</div>
        </CloseContext.Provider>
      )}
    </details>
  )
}
