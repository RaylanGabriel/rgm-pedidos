"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { stores } from "@/db/schema"
import { isOwner } from "@/lib/auth/session"
import { isHexColor } from "@/lib/color"
import { formText, imageUrlSchema, optional, zodErrorState, type FormState } from "@/lib/form-state"

const settingsSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido (com DDD)"))
    .transform((v) => (v === "" ? null : v)),
  logoUrl: optional(imageUrlSchema),
  primaryColor: z.string().refine(isHexColor, "Cor inválida"),
  avgPrepMinutes: z.coerce.number().int("Use minutos inteiros").min(1, "Mínimo 1 minuto").max(120, "Máximo 120 minutos"),
})

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return { error: "Só o dono da loja pode alterar as configurações." }

  const parsed = settingsSchema.safeParse({
    name: formText(fd, "name"),
    phone: formText(fd, "phone"),
    logoUrl: formText(fd, "logoUrl"),
    primaryColor: formText(fd, "primaryColor").toLowerCase(),
    avgPrepMinutes: formText(fd, "avgPrepMinutes"),
  })
  if (!parsed.success) return zodErrorState(parsed.error)

  await db.update(stores).set(parsed.data).where(eq(stores.id, ctx.store.id))
  revalidatePath("/admin", "layout")
  revalidatePath(`/loja/${ctx.store.slug}`, "layout")
  return { ok: true, message: "Configurações salvas." }
}
