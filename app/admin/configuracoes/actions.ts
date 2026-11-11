"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { stores } from "@/db/schema"
import { isOwner } from "@/lib/auth/session"
import { isHexColor } from "@/lib/color"
import { parseFacebook, parseInstagram } from "@/lib/links"
import { formText, zodErrorState, type FormState } from "@/lib/form-state"
import { deleteImage, fileFrom, uploadImage } from "@/lib/storage"

const settingsSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido (com DDD)"))
    .transform((v) => (v === "" ? null : v)),
  address: z
    .string()
    .max(200, "Endereço muito longo")
    .transform((v) => v.replace(/\s+/g, " ").trim() || null),
  instagram: z
    .string()
    .max(200)
    .transform((v, ctx) => {
      const r = parseInstagram(v)
      if (r === null) ctx.addIssue({ code: "custom", message: "Instagram inválido: use @usuario ou o link do perfil" })
      return r ?? null
    }),
  facebook: z
    .string()
    .max(300)
    .transform((v, ctx) => {
      const r = parseFacebook(v)
      if (r === null) ctx.addIssue({ code: "custom", message: "Facebook inválido: cole o link da página" })
      return r ?? null
    }),
  primaryColor: z.string().refine(isHexColor, "Cor inválida"),
  avgPrepMinutes: z.coerce.number().int("Use minutos inteiros").min(1, "Mínimo 1 minuto").max(120, "Máximo 120 minutos"),
})

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return { error: "Só o dono da loja pode alterar as configurações." }

  const parsed = settingsSchema.safeParse({
    name: formText(fd, "name"),
    phone: formText(fd, "phone"),
    address: formText(fd, "address"),
    instagram: formText(fd, "instagram"),
    facebook: formText(fd, "facebook"),
    primaryColor: formText(fd, "primaryColor").toLowerCase(),
    avgPrepMinutes: formText(fd, "avgPrepMinutes"),
  })
  if (!parsed.success) return zodErrorState(parsed.error)

  // Logo e capa: nova (substitui), removida, ou mantém a atual
  const images: Partial<Record<"logoUrl" | "coverUrl", string | null>> = {}
  const uploaded: string[] = []
  for (const [field, key, folder] of [
    ["logo", "logoUrl", "logo"],
    ["cover", "coverUrl", "cover"],
  ] as const) {
    const file = fileFrom(fd, field)
    if (file) {
      const up = await uploadImage(file, `stores/${ctx.store.id}/${folder}`)
      if ("error" in up) {
        await Promise.all(uploaded.map(deleteImage))
        return { fieldErrors: { [field]: up.error }, error: up.error }
      }
      images[key] = up.url
      uploaded.push(up.url)
    } else if (fd.get(field === "logo" ? "removeLogo" : "removeCover") === "on") images[key] = null
  }

  await db
    .update(stores)
    .set({ ...parsed.data, ...images })
    .where(eq(stores.id, ctx.store.id))
  if ("logoUrl" in images) await deleteImage(ctx.store.logoUrl)
  if ("coverUrl" in images) await deleteImage(ctx.store.coverUrl)

  revalidatePath("/admin", "layout")
  revalidatePath(`/loja/${ctx.store.slug}`, "layout")
  return { ok: true, message: "Configurações salvas." }
}
