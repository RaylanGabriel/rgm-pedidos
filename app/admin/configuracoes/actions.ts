"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { stores } from "@/db/schema"
import { isOwner } from "@/lib/auth/session"
import { isHexColor } from "@/lib/color"
import { formText, zodErrorState, type FormState } from "@/lib/form-state"
import { deleteImage, fileFrom, uploadImage } from "@/lib/storage"

const settingsSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido (com DDD)"))
    .transform((v) => (v === "" ? null : v)),
  primaryColor: z.string().refine(isHexColor, "Cor inválida"),
  avgPrepMinutes: z.coerce.number().int("Use minutos inteiros").min(1, "Mínimo 1 minuto").max(120, "Máximo 120 minutos"),
})

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return { error: "Só o dono da loja pode alterar as configurações." }

  const parsed = settingsSchema.safeParse({
    name: formText(fd, "name"),
    phone: formText(fd, "phone"),
    primaryColor: formText(fd, "primaryColor").toLowerCase(),
    avgPrepMinutes: formText(fd, "avgPrepMinutes"),
  })
  if (!parsed.success) return zodErrorState(parsed.error)

  // Logo: nova (substitui), removida, ou mantém a atual
  const file = fileFrom(fd, "logo")
  let logoUrl: string | null | undefined
  if (file) {
    const up = await uploadImage(file, `stores/${ctx.store.id}/logo`)
    if ("error" in up) return { fieldErrors: { logo: up.error }, error: up.error }
    logoUrl = up.url
  } else if (fd.get("removeLogo") === "on") logoUrl = null

  await db
    .update(stores)
    .set(logoUrl === undefined ? parsed.data : { ...parsed.data, logoUrl })
    .where(eq(stores.id, ctx.store.id))
  if (logoUrl !== undefined) await deleteImage(ctx.store.logoUrl)

  revalidatePath("/admin", "layout")
  revalidatePath(`/loja/${ctx.store.slug}`, "layout")
  return { ok: true, message: "Configurações salvas." }
}
