"use server"

import { revalidatePath } from "next/cache"
import { and, eq, not } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { deliveryZones, stores } from "@/db/schema"
import { isOwner } from "@/lib/auth/session"
import { formText, priceSchema, zodErrorState, type FormState } from "@/lib/form-state"

/* Entrega: só o dono altera. Tudo filtrado pelo store_id da sessão. */

const NO_PERMISSION: FormState = { error: "Só o dono da loja pode alterar a entrega." }
const uuid = z.string().uuid()

function refresh(slug: string) {
  revalidatePath("/admin/entrega")
  revalidatePath(`/loja/${slug}`, "layout")
}

// ---------- Regras ----------
const settingsSchema = z.object({
  deliveryEnabled: z.boolean(),
  deliveryPricing: z.enum(["fixed", "zones"], { message: "Escolha como cobrar a entrega" }),
  deliveryFixedFee: priceSchema,
  deliveryMinOrder: priceSchema,
})

export async function saveDeliverySettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const parsed = settingsSchema.safeParse({
    deliveryEnabled: fd.get("deliveryEnabled") === "on",
    deliveryPricing: formText(fd, "deliveryPricing"),
    deliveryFixedFee: formText(fd, "deliveryFixedFee") || "0",
    deliveryMinOrder: formText(fd, "deliveryMinOrder") || "0",
  })
  if (!parsed.success) return zodErrorState(parsed.error)

  await db.update(stores).set(parsed.data).where(eq(stores.id, ctx.store.id))
  refresh(ctx.store.slug)
  return { ok: true, message: "Regras de entrega salvas." }
}

// ---------- Bairros ----------
const zoneSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(60, "Nome muito longo"),
  fee: priceSchema,
  active: z.boolean(),
})

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ("code" in e ? e.code : (e as { cause?: { code?: string } }).cause?.code) === "23505"

export async function saveZoneAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const parsed = zoneSchema.safeParse({
    name: formText(fd, "name").replace(/\s+/g, " "),
    fee: formText(fd, "fee"),
    active: fd.get("active") === "on",
  })
  if (!parsed.success) return zodErrorState(parsed.error)

  const id = formText(fd, "id")
  try {
    if (id) {
      if (!uuid.safeParse(id).success) return { error: "Bairro inválido." }
      const updated = await db
        .update(deliveryZones)
        .set(parsed.data)
        .where(and(eq(deliveryZones.id, id), eq(deliveryZones.storeId, ctx.store.id)))
        .returning({ id: deliveryZones.id })
      if (!updated.length) return { error: "Bairro não encontrado." }
    } else {
      await db.insert(deliveryZones).values({ ...parsed.data, storeId: ctx.store.id })
    }
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: "Esse bairro já está cadastrado." } }
    throw e
  }
  refresh(ctx.store.slug)
  return { ok: true, message: id ? "Bairro atualizado." : "Bairro adicionado." }
}

/**
 * Vários bairros de uma vez, um por linha: "Centro; 5,00" (também aceita "Centro - 5" ou "Centro 5,00").
 * Bairros que já existem são ignorados.
 */
export async function bulkAddZonesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION

  const lines = formText(fd, "lines")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { fieldErrors: { lines: "Escreva pelo menos um bairro." } }
  if (lines.length > 200) return { fieldErrors: { lines: "Máximo de 200 bairros por vez." } }

  const rows: { name: string; fee: string }[] = []
  const bad: number[] = []
  lines.forEach((line, i) => {
    const m = line.match(/^(.+?)[\s;:\-–—|]+(?:R\$\s*)?(\d{1,4}(?:[.,]\d{1,2})?)$/i)
    const zone = m && zoneSchema.safeParse({ name: m[1].trim().replace(/\s+/g, " "), fee: m[2], active: true })
    if (zone?.success) rows.push({ name: zone.data.name, fee: zone.data.fee })
    else bad.push(i + 1)
  })
  if (bad.length) return { fieldErrors: { lines: `Não entendi a(s) linha(s) ${bad.join(", ")}. Use o formato: Centro; 5,00` } }

  const added = await db
    .insert(deliveryZones)
    .values(rows.map((r) => ({ ...r, storeId: ctx.store.id })))
    .onConflictDoNothing()
    .returning({ id: deliveryZones.id })

  refresh(ctx.store.slug)
  const skipped = rows.length - added.length
  return {
    ok: true,
    message: `${added.length} bairro(s) adicionado(s).${skipped ? ` ${skipped} já existia(m) e foi(ram) ignorado(s).` : ""}`,
  }
}

export async function toggleZoneAction(id: string) {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  await db
    .update(deliveryZones)
    .set({ active: not(deliveryZones.active) })
    .where(and(eq(deliveryZones.id, id), eq(deliveryZones.storeId, ctx.store.id)))
  refresh(ctx.store.slug)
}

export async function deleteZoneAction(id: string) {
  const ctx = await isOwner()
  if (!ctx || !uuid.safeParse(id).success) return
  // Pedidos antigos guardam o nome do bairro e a taxa, então apagar não altera o histórico
  await db.delete(deliveryZones).where(and(eq(deliveryZones.id, id), eq(deliveryZones.storeId, ctx.store.id)))
  refresh(ctx.store.slug)
}
