"use server"

import { revalidatePath } from "next/cache"
import { and, eq, not } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { deliveryDistanceTiers, deliveryZones, stores } from "@/db/schema"
import { isOwner } from "@/lib/auth/session"
import { formText, priceSchema, zodErrorState, type FormState } from "@/lib/form-state"
import { geocodeStoreAddress, reverseStoreLocation } from "@/lib/geo"
import { rateLimit } from "@/lib/rate-limit-server"

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
  deliveryPricing: z.enum(["fixed", "zones", "distance"], { message: "Escolha como cobrar a entrega" }),
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

// ---------- Entrega por distância ----------
const tiersSchema = z
  .array(
    z.object({
      upToKm: z.coerce.number({ message: "Distância inválida" }).min(0.5, "Mínimo 0,5 km").max(100, "Máximo 100 km"),
      fee: z.string().pipe(priceSchema),
    }),
  )
  .min(1, "Cadastre pelo menos uma faixa")
  .max(10, "No máximo 10 faixas")

/** Troca todas as faixas da loja de uma vez (a lista inteira vem do formulário). */
export async function saveTiersAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  let raw: unknown
  try {
    raw = JSON.parse(String(fd.get("tiers") ?? "[]"))
  } catch {
    return { error: "Não foi possível ler as faixas. Recarregue a página." }
  }
  const parsed = tiersSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Verifique as faixas." }
  const tiers = parsed.data
    .map((t) => ({ upToKm: Math.round(t.upToKm * 10) / 10, fee: t.fee }))
    .sort((a, b) => a.upToKm - b.upToKm)
  if (new Set(tiers.map((t) => t.upToKm)).size !== tiers.length) return { error: "Duas faixas com a mesma distância. Ajuste e salve de novo." }

  await db.delete(deliveryDistanceTiers).where(eq(deliveryDistanceTiers.storeId, ctx.store.id))
  await db.insert(deliveryDistanceTiers).values(tiers.map((t) => ({ storeId: ctx.store.id, upToKm: t.upToKm.toFixed(1), fee: t.fee })))
  refresh(ctx.store.slug)
  return { ok: true, message: "Faixas salvas." }
}

/** Localiza a loja pelo endereço das Configurações. */
export async function locateFromAddressAction(): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  if (!ctx.store.address) return { error: "Cadastre o endereço da loja em Configurações primeiro." }
  if (!(await rateLimit(`geo:${ctx.store.id}`, 20, 60 * 60 * 1000))) return { error: "Muitas tentativas. Tente de novo mais tarde." }
  try {
    const loc = await geocodeStoreAddress(ctx.store.address)
    if (!loc) return { error: "Não encontramos esse endereço no mapa. Inclua a cidade e o estado em Configurações, ou use a localização do aparelho." }
    await db.update(stores).set({ location: loc }).where(eq(stores.id, ctx.store.id))
  } catch {
    return { error: "O serviço de mapas não respondeu. Tente de novo em instantes." }
  }
  refresh(ctx.store.slug)
  return { ok: true, message: "Localização encontrada. Confira o ponto no mapa." }
}

const deviceSchema = z.object({
  lat: z.number().min(-34).max(6), // dentro do Brasil
  lng: z.number().min(-74).max(-34),
})

/** Dono na loja: usa o GPS do aparelho (o ponto mais preciso). */
export async function locateFromDeviceAction(lat: number, lng: number): Promise<FormState> {
  const ctx = await isOwner()
  if (!ctx) return NO_PERMISSION
  const parsed = deviceSchema.safeParse({ lat, lng })
  if (!parsed.success) return { error: "Localização fora do Brasil ou inválida." }
  if (!(await rateLimit(`geo:${ctx.store.id}`, 20, 60 * 60 * 1000))) return { error: "Muitas tentativas. Tente de novo mais tarde." }
  const loc = await reverseStoreLocation(parsed.data.lat, parsed.data.lng)
  await db.update(stores).set({ location: loc }).where(eq(stores.id, ctx.store.id))
  refresh(ctx.store.slug)
  return { ok: true, message: "Localização da loja salva pelo aparelho." }
}
