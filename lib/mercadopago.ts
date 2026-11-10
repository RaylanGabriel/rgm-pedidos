import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { and, eq, isNotNull, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { orders, storePaymentAccounts } from "@/db/schema"
import { decryptSecret, encryptSecret } from "@/lib/crypto"

/**
 * Integração com o Mercado Pago (aplicação RGM_PEDIDOS).
 * - Cada loja conecta a própria conta por OAuth; o Pix cai direto na conta do dono.
 * - Pix criado pela API de Orders (POST /v1/orders, type "online", pix/bank_transfer).
 * - Confirmação: webhook (assinatura conferida) + consulta na API ao abrir a tela do pedido.
 *
 * Variáveis: MP_CLIENT_ID, MP_CLIENT_SECRET, MP_REDIRECT_URI, MP_WEBHOOK_SECRET, MP_TOKEN_KEY,
 * MP_TEST_MODE ("true" = credenciais de teste), MP_TEST_ACCESS_TOKEN (só para testes).
 */
const API = "https://api.mercadopago.com"
export const PIX_MINUTES = 30 // validade do QR (o Mercado Pago aceita de 30 min a 30 dias)

export const mpTestMode = () => process.env.MP_TEST_MODE === "true"
export const mpConfigured = () => !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET && process.env.MP_REDIRECT_URI && process.env.MP_TOKEN_KEY)

// ---------- OAuth ----------
export function authorizationUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID!,
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: process.env.MP_REDIRECT_URI!,
  })
  return `https://auth.mercadopago.com/authorization?${p}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number // segundos
  user_id: number
  live_mode?: boolean
}

async function tokenRequest(body: Record<string, unknown>): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: process.env.MP_CLIENT_ID, client_secret: process.env.MP_CLIENT_SECRET, ...body }),
    cache: "no-store",
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new Error(`MP_OAUTH_${res.status}:${json.error ?? json.message ?? "erro"}`)
  return json as TokenResponse
}

/** Troca o código do retorno do OAuth pelos tokens da loja e salva (criptografado). */
export async function connectWithCode(storeId: string, userId: string, code: string) {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.MP_REDIRECT_URI,
    test_token: mpTestMode(),
  })
  await saveAccount(storeId, userId, t)
}

/** Só em modo de teste: liga a loja na conta de teste da própria plataforma (sem OAuth). */
export async function connectPlatformTestAccount(storeId: string, userId: string) {
  const token = process.env.MP_TEST_ACCESS_TOKEN
  if (!mpTestMode() || !token) throw new Error("Disponível só em modo de teste")
  const me = await mpFetch<{ id: number }>(token, "/users/me")
  await saveAccount(storeId, userId, { access_token: token, expires_in: 10 * 365 * 86400, user_id: me.id, live_mode: false })
}

async function saveAccount(storeId: string, userId: string | null, t: TokenResponse) {
  const values = {
    mpUserId: String(t.user_id),
    accessTokenEnc: encryptSecret(t.access_token),
    refreshTokenEnc: t.refresh_token ? encryptSecret(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    liveMode: !!t.live_mode,
  }
  await db
    .insert(storePaymentAccounts)
    .values({ storeId, connectedBy: userId, ...values })
    .onConflictDoUpdate({ target: storePaymentAccounts.storeId, set: { ...values, connectedAt: new Date(), ...(userId ? { connectedBy: userId } : {}) } })
}

export async function disconnectStore(storeId: string) {
  await db.delete(storePaymentAccounts).where(eq(storePaymentAccounts.storeId, storeId))
}

export async function getAccountInfo(storeId: string) {
  const [row] = await db
    .select({ mpUserId: storePaymentAccounts.mpUserId, liveMode: storePaymentAccounts.liveMode, connectedAt: storePaymentAccounts.connectedAt, expiresAt: storePaymentAccounts.expiresAt })
    .from(storePaymentAccounts)
    .where(eq(storePaymentAccounts.storeId, storeId))
    .limit(1)
  return row ?? null
}

/** Token válido da loja (renova sozinho quando faltar menos de 7 dias). null = loja sem Mercado Pago. */
export async function storeAccessToken(storeId: string): Promise<string | null> {
  const [row] = await db.select().from(storePaymentAccounts).where(eq(storePaymentAccounts.storeId, storeId)).limit(1)
  if (!row) return null
  const soon = Date.now() + 7 * 86400_000
  if (row.expiresAt.getTime() > soon || !row.refreshTokenEnc) return decryptSecret(row.accessTokenEnc)
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(row.refreshTokenEnc) })
    await saveAccount(storeId, null, t)
    return t.access_token
  } catch (err) {
    console.error("Mercado Pago: falha ao renovar token da loja", storeId, err)
    // ainda não venceu: usa o atual; venceu: loja precisa reconectar
    return row.expiresAt.getTime() > Date.now() ? decryptSecret(row.accessTokenEnc) : null
  }
}

// ---------- API ----------
async function mpFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`MP_API_${res.status}:${json.message ?? json.error ?? "erro"}`)
  return json as T
}

interface MpOrder {
  id: string
  status: string // action_required | processed | expired | canceled | failed ...
  status_detail?: string
  external_reference?: string
  transactions?: {
    payments?: { id: string; status: string; status_detail?: string; payment_method?: { qr_code?: string; ticket_url?: string } }[]
  }
}

/** Cria a cobrança Pix na conta da loja. Valor = total calculado pelo banco (nunca o do navegador). */
export async function createPixCharge(
  token: string,
  o: { id: string; orderNumber: number; total: number; storeName: string },
): Promise<{ mpOrderId: string; pixCode: string; expiresAt: Date }> {
  const amount = o.total.toFixed(2)
  const body = {
    type: "online",
    processing_mode: "automatic",
    external_reference: o.id,
    total_amount: amount,
    description: `Pedido #${o.orderNumber} - ${o.storeName}`.slice(0, 120),
    payer: {
      // Não pedimos e-mail ao cliente; o Mercado Pago exige um. Em teste, "APRO" aprova sozinho.
      email: `pedido-${o.orderNumber}@rgm.dev.br`,
      ...(mpTestMode() ? { first_name: "APRO" } : {}),
    },
    transactions: { payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: `PT${PIX_MINUTES}M` }] },
  }
  const mp = await mpFetch<MpOrder>(token, "/v1/orders", {
    method: "POST",
    headers: { "X-Idempotency-Key": `pix-${o.id}` }, // mesmo pedido nunca gera duas cobranças
    body: JSON.stringify(body),
  })
  const pixCode = mp.transactions?.payments?.[0]?.payment_method?.qr_code
  if (!pixCode) throw new Error("MP_SEM_QR")
  return { mpOrderId: mp.id, pixCode, expiresAt: new Date(Date.now() + PIX_MINUTES * 60_000) }
}

const isPaid = (mp: MpOrder) =>
  mp.status === "processed" || (mp.transactions?.payments ?? []).some((p) => p.status === "processed" || p.status === "approved")
const isDead = (mp: MpOrder) => ["expired", "canceled", "cancelled", "failed", "refunded"].includes(mp.status)

/**
 * Consulta a cobrança no Mercado Pago e atualiza o pedido (pago → entra na cozinha; vencida → cancela).
 * Usada pelo webhook e pela tela do pedido. Idempotente.
 */
export async function syncPixOrder(orderId: string): Promise<"paid" | "pending" | "cancelled" | "ignored"> {
  const [o] = await db
    .select({ id: orders.id, storeId: orders.storeId, mpOrderId: orders.mpOrderId, paymentStatus: orders.paymentStatus, status: orders.status, total: orders.total })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!o?.mpOrderId) return "ignored"
  if (o.paymentStatus === "paid") return "paid"
  const token = await storeAccessToken(o.storeId)
  if (!token) return "pending"
  const mp = await mpFetch<MpOrder>(token, `/v1/orders/${encodeURIComponent(o.mpOrderId)}`)
  if (mp.external_reference && mp.external_reference !== o.id) return "ignored" // nunca confia em cobrança de outro pedido
  if (isPaid(mp)) {
    await db
      .update(orders)
      .set({ paymentStatus: "paid", paidAt: new Date() }) // a cozinha conta a espera a partir do pagamento
      .where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "pending")))
    return "paid"
  }
  if (isDead(mp) && o.status !== "cancelled") {
    await db.update(orders).set({ status: "cancelled", completedAt: new Date() }).where(and(eq(orders.id, o.id), eq(orders.paymentStatus, "pending")))
    return "cancelled"
  }
  return "pending"
}

/** Pix não pago depois do prazo (+5 min de folga) vira cancelado. Roda ao ler pedidos, como a entrega automática. */
export async function cancelOverduePix(storeId: string) {
  await db
    .update(orders)
    .set({ status: "cancelled", completedAt: sql`now()` })
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.paymentStatus, "pending"),
        isNotNull(orders.mpOrderId),
        eq(orders.status, "pending"),
        lt(orders.pixExpiresAt, sql`now() - interval '5 minutes'`),
      ),
    )
}

// ---------- Webhook ----------
/**
 * Assinatura do webhook: header x-signature "ts=...,v1=..." e x-request-id.
 * Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" → HMAC-SHA256 com MP_WEBHOOK_SECRET (hex).
 */
export function verifyWebhookSignature(signature: string | null, requestId: string | null, dataId: string | null) {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=", 2) as [string, string]))
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false
  let manifest = ""
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const expected = createHmac("sha256", secret).update(manifest).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(v1)
  return a.length === b.length && timingSafeEqual(a, b)
}

