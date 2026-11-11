"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { stores } from "@/db/schema"
import { isOwner } from "@/lib/auth/session"
import { parseHours, storeOpenState } from "@/lib/hours"
import type { FormState } from "@/lib/form-state"

export async function saveHoursAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return { error: "Só o dono da loja pode alterar os horários." }

  const enabled = fd.get("enabled") === "on"
  let raw: unknown = null
  try {
    raw = JSON.parse(String(fd.get("hours") ?? "null"))
  } catch {
    return { error: "Não foi possível ler os horários. Recarregue a página." }
  }
  const hours = parseHours(raw)
  if (enabled && !hours) return { error: "Marque pelo menos um dia aberto, com horário de início e fim diferentes." }

  // Ao ligar/desligar, a loja continua como está agora (nada abre ou fecha de surpresa);
  // salvar também cancela um "Fechar/Abrir agora" que estivesse valendo.
  const current = storeOpenState(ctx.store)
  await db
    .update(stores)
    .set({ hoursEnabled: enabled, openingHours: hours ?? ctx.store.openingHours, manualUntil: null, isOpen: current.open })
    .where(eq(stores.id, ctx.store.id))

  revalidatePath("/admin", "layout")
  revalidatePath(`/loja/${ctx.store.slug}`, "layout")
  return {
    ok: true,
    message: enabled ? "Horários salvos. A loja agora abre e fecha sozinha." : "Horários salvos. Abrir e fechar continua manual.",
  }
}
