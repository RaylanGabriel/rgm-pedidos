import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { and, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { errorEvents, orders, storePaymentAccounts, stores } from "@/db/schema"
import { recordError, safeErrorText } from "@/lib/alerts"
import { decryptSecret, encryptSecret } from "@/lib/crypto"

/**
 * Integração com o Mercado Pago (aplicação RGM-PEDIDOS).
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
  // O app é do Mercado Pago Brasil: o endereço genérico (auth.mercadopago.com) responde "o aplicativo não está pronto
  // para se conectar"; o do país (auth.mercadopago.com.br) abre o login normalmente.
  const base = process.env.MP_AUTH_URL || "https://auth.mercadopago.com.br/authorization"
  return `${base}?${p}`
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

/**
 * Só em produção e só para o super admin: liga a loja na conta DONA do app (a do próprio Raylan),
 * pelo Access Token de produção — sem OAuth, que serve para contas de outras pessoas.
 * Usado na Mr. Smash (loja própria) e para o primeiro pagamento real que o Mercado Pago exige para "liberar" o app.
 */
export const ownerAccountAvailable = () => !mpTestMode() && !!process.env.MP_PROD_ACCESS_TOKEN

export async function connectPlatformOwnerAccount(storeId: string, userId: string) {
  const token = process.env.MP_PROD_ACCESS_TOKEN
  if (!ownerAccountAvailable() || !token) throw new Error("Disponível só em produção")
  const me = await mpFetch<{ id: number }>(token, "/users/me")
  // Token de produção da própria conta não expira como o do OAuth; guardamos validade longa
  await saveAccount(storeId, userId, { access_token: token, expires_in: 10 * 365 * 86400, user_id: me.id, live_mode: true })
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

/** Conta conectada (para mostrar no painel). needsReconnect = conectada em teste, mas a plataforma já está em produção. */
export async function getAccountInfo(storeId: string) {
  const [row] = await db
    .select({ mpUserId: storePaymentAccounts.mpUserId, liveMode: storePaymentAccounts.liveMode, connectedAt: storePaymentAccounts.connectedAt, expiresAt: storePaymentAccounts.expiresAt })
    .from(storePaymentAccounts)
    .where(eq(storePaymentAccounts.storeId, storeId))
    .limit(1)
  return row ? { ...row, needsReconnect: !mpTestMode() && !row.liveMode } : null
}

/** Token válido da loja (renova sozinho quando faltar menos de 7 dias). null = loja sem Mercado Pago. */
export async function storeAccessToken(storeId: string): Promise<string | null> {
  const [row] = await db.select().from(storePaymentAccounts).where(eq(storePaymentAccounts.storeId, storeId)).limit(1)
  if (!row) return null
  // Em produção, conexão feita no modo de teste não vale (geraria Pix de mentira): a loja precisa reconectar
  if (!mpTestMode() && !row.liveMode) return null
  const soon = Date.now() + 7 * 86400_000
  if (row.expiresAt.getTime() > soon || !row.refreshTokenEnc) return decryptSecret(row.accessTokenEnc)
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(row.refreshTokenEnc) })
    await saveAccount(storeId, null, t)
    return t.access_token
  } catch (err) {
    console.error("Mercado Pago: falha ao renovar token da loja", storeId, safeErrorText(err))
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
export type PixItem = { title: string; description: string | null; unitPrice: number; quantity: number }

/** "Mr. Smash Street" → "MR SMASH STREET" (nome no extrato: sem acento, até 22 caracteres). */
const statementName = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 22)

/**
 * Itens no formato do Mercado Pago (melhora a análise do pagamento e mostra o que foi vendido no app do dono).
 * Ele recusa a cobrança se a soma não bater com o total: nesse caso (arredondamento) manda sem itens.
 */
function mpItems(items: PixItem[], deliveryFee: number, total: number) {
  const list = items.map((i, n) => ({
    title: i.title.slice(0, 120),
    ...(i.description ? { description: i.description.slice(0, 250) } : {}),
    unit_price: i.unitPrice.toFixed(2),
    quantity: i.quantity,
    category_id: "others", // o Mercado Pago não tem categoria de comida
    external_code: `item-${n + 1}`,
  }))
  if (deliveryFee > 0) list.push({ title: "Taxa de entrega", unit_price: deliveryFee.toFixed(2), quantity: 1, category_id: "services", external_code: "entrega" })
  const cents = list.reduce((s, i) => s + Math.round(Number(i.unit_price) * 100) * i.quantity, 0)
  return cents === Math.round(total * 100) ? list : null
}

export async function createPixCharge(
  token: string,
  o: { id: string; orderNumber: number; total: number; storeName: string; customerName: string; items: PixItem[]; deliveryFee: number },
): Promise<{ mpOrderId: string; pixCode: string; expiresAt: Date }> {
  const amount = o.total.toFixed(2)
  const [firstName, ...rest] = o.customerName.trim().split(/\s+/)
  const items = mpItems(o.items, o.deliveryFee, o.total)
  const descriptor = statementName(o.storeName)
  const body = {
    type: "online",
    processing_mode: "automatic",
    external_reference: o.id,
    total_amount: amount,
    description: `Pedido #${o.orderNumber} - ${o.storeName}`.slice(0, 120),
    ...(items ? { items } : {}),
    payer: {
      // Não pedimos e-mail ao cliente; o Mercado Pago exige um. Em teste, "APRO" no nome aprova sozinho.
      email: `pedido-${o.orderNumber}@rgm.dev.br`,
      first_name: mpTestMode() ? "APRO" : firstName,
      ...(rest.length ? { last_name: rest.join(" ").slice(0, 60) } : {}),
    },
    transactions: {
      payments: [
        {
          amount,
          payment_method: { id: "pix", type: "bank_transfer", ...(descriptor ? { statement_descriptor: descriptor } : {}) },
          expiration_time: `PT${PIX_MINUTES}M`,
        },
      ],
    },
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
 * "unverifiable" = a loja está sem conexão válida com o Mercado Pago (desconectou, renovação falhou): não dá para
 * saber se foi pago — quem chama nunca deve tratar isso como "não pago".
 */
export async function syncPixOrder(orderId: string): Promise<"paid" | "pending" | "cancelled" | "ignored" | "unverifiable"> {
  const [o] = await db
    .select({ id: orders.id, storeId: orders.storeId, mpOrderId: orders.mpOrderId, paymentStatus: orders.paymentStatus, status: orders.status, total: orders.total })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!o?.mpOrderId) return "ignored"
  if (o.paymentStatus === "paid") return "paid"
  const token = await storeAccessToken(o.storeId)
  if (!token) return "unverifiable"
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

/**
 * Desiste do Pix de um pedido (balcão: cliente pagou de outro jeito ou desistiu).
 * Confere antes se já foi pago (nesse caso não cancela nada) e cancela a cobrança no Mercado Pago,
 * para o QR não poder mais ser pago. "paid" = já tinha sido pago; "ok" = cobrança encerrada.
 */
export async function dropPixCharge(orderId: string): Promise<"paid" | "ok"> {
  const status = await syncPixOrder(orderId).catch(() => "pending" as const)
  if (status === "paid") return "paid"
  const [o] = await db.select({ storeId: orders.storeId, mpOrderId: orders.mpOrderId }).from(orders).where(eq(orders.id, orderId)).limit(1)
  if (o?.mpOrderId) {
    const token = await storeAccessToken(o.storeId)
    if (token) {
      try {
        await mpFetch<MpOrder>(token, `/v1/orders/${encodeURIComponent(o.mpOrderId)}/cancel`, {
          method: "POST",
          headers: { "X-Idempotency-Key": `cancel-${orderId}` },
        })
      } catch (err) {
        // Pode já ter vencido/sido cancelada; se foi paga nesse meio-tempo, a nova consulta pega
        console.warn("Pix: não foi possível cancelar a cobrança", err instanceof Error ? err.message : err)
        if ((await syncPixOrder(orderId).catch(() => "pending")) === "paid") return "paid"
      }
    }
  }
  return "ok"
}

/**
 * Pix não pago depois do prazo (+5 min de folga) vira cancelado. Roda ao ler pedidos e no cron (sem `storeId` = todas
 * as lojas). Antes de cancelar, consulta o Mercado Pago: se o aviso (webhook) falhou e ninguém estava com a tela aberta,
 * um Pix PAGO seria cancelado. Se a consulta falhar (rede, Mercado Pago fora do ar), não cancela — tenta de novo na
 * próxima vez. "Cobrança não encontrada" (404) é diferente: não existe, então não pode ser paga → cancela.
 * Loja sem conexão válida ("unverifiable"): também não cancela — o pedido fica em "Aguardando Pix", onde a equipe
 * resolve à mão (tela do QR), e o cron avisa por e-mail uma vez por pedido. Só olha Pix vencidos há menos de 2 dias:
 * um não verificável não fica sendo consultado para sempre (o Mercado Pago responde muito antes disso).
 * Devolve quantos foram cancelados.
 */
export async function cancelOverduePix(storeId?: string) {
  const overdue = and(
    storeId ? eq(orders.storeId, storeId) : undefined,
    eq(orders.paymentStatus, "pending"),
    isNotNull(orders.mpOrderId),
    eq(orders.status, "pending"),
    lt(orders.pixExpiresAt, sql`now() - interval '5 minutes'`),
    // cron (sem loja): até 2 dias; tela da cozinha/pedido: só os últimos 30 min (não repete o mesmo pedido a cada 8 s)
    gt(orders.pixExpiresAt, storeId ? sql`now() - interval '30 minutes'` : sql`now() - interval '2 days'`),
  )
  const rows = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, slug: stores.slug })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(overdue)
  const toCancel: string[] = []
  for (const { id, orderNumber, slug } of rows) {
    try {
      const status = await syncPixOrder(id) // pago → entra na cozinha; vencido no MP → já cancela
      if (status === "pending" || status === "ignored") toCancel.push(id)
      else if (status === "unverifiable" && !storeId) {
        // Um aviso por pedido: o próprio registro do erro marca que já avisamos (independe do ritmo do cron)
        const path = `pix-sem-conexao/${id}`
        const [seen] = await db.select({ id: errorEvents.id }).from(errorEvents).where(and(eq(errorEvents.source, "pix"), eq(errorEvents.path, path))).limit(1)
        if (!seen) await recordError(
          "pix",
          path,
          `Pix do pedido #${orderNumber} (loja ${slug}) venceu e não dá para conferir: a loja está sem conexão válida com o Mercado Pago. O pedido NÃO foi cancelado e segue em "Aguardando Pix" — confira no app do Mercado Pago da loja e peça para reconectar.`,
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.startsWith("MP_API_404:")) toCancel.push(id)
      else console.error("Pix vencido: falha ao consultar o Mercado Pago, fica para a próxima:", message)
    }
  }
  if (!toCancel.length) return 0
  const cancelled = await db
    .update(orders)
    .set({ status: "cancelled", completedAt: sql`now()` })
    .where(and(overdue, inArray(orders.id, toCancel)))
    .returning({ id: orders.id })
  return cancelled.length
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

