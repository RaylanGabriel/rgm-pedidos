"use client"

import { useState, type ReactNode } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { ActionButton } from "@/components/admin/form-ui"
import { AddressForm, type AddressValue } from "./account-forms"
import { deleteAddressAction } from "./actions"

export function AccountSection({ title, description, icon, children }: { title: string; description?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5" aria-label={title}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </h2>
      {description && <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-4"}>{children}</div>
    </section>
  )
}

export const addressLine = (a: AddressValue) =>
  [[a.street, a.number].filter(Boolean).join(", "), a.district, [a.city, a.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ")

export function AddressList({ addresses }: { addresses: AddressValue[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  if (!addresses.length) return <p className="text-sm text-muted-foreground">Nenhum endereço salvo ainda.</p>
  return (
    <ul className="divide-y">
      {addresses.map((a) => (
        <li key={a.id} className="py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.label || "Endereço"}</p>
              <p className="text-sm text-muted-foreground">{addressLine(a)}</p>
              {a.complement && <p className="text-xs text-muted-foreground">{a.complement}</p>}
            </div>
            <button
              type="button"
              onClick={() => setEditing(editing === a.id ? null : a.id)}
              aria-label={`Editar ${a.label || "endereço"}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <ActionButton
              action={deleteAddressAction.bind(null, a.id)}
              confirmText={`Apagar o endereço "${a.label || addressLine(a)}"?`}
              variant="ghost"
              size="icon"
              aria-label={`Apagar ${a.label || "endereço"}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          </div>
          {editing === a.id && (
            <div className="mt-3 rounded-xl border p-4">
              <AddressForm address={a} onDone={() => setEditing(null)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
