import "server-only"

import { createHash } from "node:crypto"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { deliveryDistanceTiers, geocodeCache } from "@/db/schema"
import { formatKm, type AddressParts, type StoreLocation } from "@/lib/order-shared"

/**
 * Entrega por distância.
 * - Endereço → coordenada: Nominatim (OpenStreetMap), grátis, máx. 1 consulta/s e identificação obrigatória.
 *   Cada endereço é consultado uma vez só (tabela geocode_cache, chave = hash; o endereço não fica guardado).
 * - Distância: linha reta (Haversine) × ROAD_FACTOR, porque o caminho pelas ruas é sempre maior que a reta.
 */
export const ROAD_FACTOR = 1.3
/** Endereço achado a mais que isso da loja = provavelmente rua com o mesmo nome em outra cidade. */
const MAX_PLAUSIBLE_KM = 60

const NOMINATIM = "https://nominatim.openstreetmap.org"
const USER_AGENT = "RGM-Pedidos/1.0 (+https://github.com/RaylanGabriel/rgm-pedidos)"

type Point = { lat: number; lng: number }

export function haversineKm(a: Point, b: Point) {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Distância estimada pelas ruas, com 1 casa decimal. */
export const roadKm = (a: Point, b: Point) => Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10

// Uma consulta por vez e com 1,1 s de intervalo (regra do Nominatim), dentro desta instância do servidor.
let queue: Promise<unknown> = Promise.resolve()
let lastCall = 0
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    return fn()
  })
  queue = run.catch(() => {})
  return run
}

type NominatimHit = {
  lat: string
  lon: string
  display_name: string
  class?: string
  type?: string
  address?: Record<string, string>
}

async function nominatim(path: string, params: Record<string, string>): Promise<NominatimHit[]> {
  const qs = new URLSearchParams({ format: "jsonv2", addressdetails: "1", "accept-language": "pt-BR", ...params })
  return throttled(async () => {
    const res = await fetch(`${NOMINATIM}/${path}?${qs}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`NOMINATIM_${res.status}`)
    const json = await res.json()
    return Array.isArray(json) ? json : json ? [json] : []
  })
}

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

/** Endereço do cliente → coordenada (com cache). precise = achou o número; senão, o meio da rua. */
export async function geocodeParts(p: AddressParts): Promise<(Point & { precise: boolean }) | null> {
  const key = createHash("sha256")
    .update(["v1", p.street, p.number, p.district ?? "", p.city, p.state].map(norm).join("|"))
    .digest("hex")
  const [cached] = await db.select().from(geocodeCache).where(eq(geocodeCache.key, key)).limit(1)
  if (cached) return cached.lat == null || cached.lng == null ? null : { lat: cached.lat, lng: cached.lng, precise: cached.precise }

  const base = { city: p.city, state: p.state, country: "Brasil", countrycodes: "br", limit: "1" }
  const tries: [Record<string, string>, boolean][] = [
    [{ ...base, street: `${p.number} ${p.street}` }, true],
    [{ ...base, street: p.street }, false],
    [{ q: [p.street, p.district, p.city, p.state, "Brasil"].filter(Boolean).join(", "), countrycodes: "br", limit: "1" }, false],
  ]
  let found: (Point & { precise: boolean }) | null = null
  for (const [params, precise] of tries) {
    const [hit] = await nominatim("search", params)
    if (hit) {
      // O Nominatim às vezes devolve só a rua mesmo pedindo o número: só é "preciso" se for um endereço/casa
      const exact = precise && !!hit.address?.house_number
      found = { lat: Number(hit.lat), lng: Number(hit.lon), precise: exact }
      break
    }
  }
  await db
    .insert(geocodeCache)
    .values({ key, lat: found?.lat ?? null, lng: found?.lng ?? null, precise: found?.precise ?? false })
    .onConflictDoNothing()
  return found
}

function cityState(a: Record<string, string> | undefined) {
  const city = a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? ""
  // "ISO3166-2-lvl4": "BR-PR" → "PR"
  const state = (a?.["ISO3166-2-lvl4"] ?? "").replace(/^BR-/, "") || a?.state || ""
  return { city, state }
}

/** Endereço da loja (texto livre das Configurações) → ponto. */
export async function geocodeStoreAddress(address: string): Promise<StoreLocation | null> {
  const [hit] = await nominatim("search", { q: address, countrycodes: "br", limit: "1" })
  if (!hit) return null
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name, ...cityState(hit.address), source: "address" }
}

/** Localização do aparelho do dono (ele está na loja) → ponto + cidade. */
export async function reverseStoreLocation(lat: number, lng: number): Promise<StoreLocation> {
  const [hit] = await nominatim("reverse", { lat: String(lat), lon: String(lng), zoom: "18" }).catch(() => [] as NominatimHit[])
  return { lat, lng, label: hit?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, ...cityState(hit?.address), source: "device" }
}

export type Tier = { upToKm: number; fee: number }

export async function distanceTiers(storeId: string): Promise<Tier[]> {
  const rows = await db
    .select({ upToKm: deliveryDistanceTiers.upToKm, fee: deliveryDistanceTiers.fee })
    .from(deliveryDistanceTiers)
    .where(eq(deliveryDistanceTiers.storeId, storeId))
    .orderBy(asc(deliveryDistanceTiers.upToKm))
  return rows.map((r) => ({ upToKm: Number(r.upToKm), fee: Number(r.fee) }))
}

export type DistanceQuote =
  | { ok: true; km: number; fee: number; precise: boolean }
  | { ok: false; reason: "not_found" | "out_of_range" | "no_location" | "unavailable"; km?: number; maxKm?: number }

/**
 * Distância e taxa para um endereço. Usado no orçamento do checkout e de novo ao criar o pedido
 * (o cache garante a mesma distância; quem escolhe a faixa de verdade é o create_order no banco).
 */
export async function quoteDistance(store: { id: string; location: unknown }, parts: AddressParts): Promise<DistanceQuote> {
  const loc = store.location as StoreLocation | null
  if (!loc || typeof loc.lat !== "number") return { ok: false, reason: "no_location" }
  let point: (Point & { precise: boolean }) | null
  try {
    point = await geocodeParts(parts)
  } catch (err) {
    console.error("Entrega por km: falha ao localizar endereço", err instanceof Error ? err.message : err)
    return { ok: false, reason: "unavailable" }
  }
  if (!point) return { ok: false, reason: "not_found" }
  const km = roadKm(loc, point)
  if (km > MAX_PLAUSIBLE_KM) return { ok: false, reason: "not_found" }
  const tiers = await distanceTiers(store.id)
  const tier = tiers.find((t) => km <= t.upToKm)
  const maxKm = tiers.at(-1)?.upToKm
  if (!tier) return { ok: false, reason: "out_of_range", km, maxKm }
  return { ok: true, km, fee: tier.fee, precise: point.precise }
}

/** Mensagem para o cliente quando não dá para calcular. */
export function quoteError(q: Exclude<DistanceQuote, { ok: true }>) {
  switch (q.reason) {
    case "out_of_range":
      return `Esse endereço fica a uns ${formatKm(q.km ?? 0)}, fora da área de entrega (até ${formatKm(q.maxKm ?? 0)}). Escolha retirada.`
    case "not_found":
      return "Não encontramos esse endereço no mapa. Confira a rua, o número e a cidade, ou escolha retirada."
    case "no_location":
      return "Esta loja ainda não configurou a entrega por distância. Escolha retirada."
    default:
      return "Não foi possível calcular a entrega agora. Tente de novo em instantes."
  }
}
