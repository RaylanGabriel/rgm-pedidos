import "server-only"

import { and, count, desc, isNull, lt, max } from "drizzle-orm"
import { db } from "@/db"
import { errorEvents } from "@/db/schema"

/**
 * Alerta de erros do site por e-mail (item 8).
 * 1. recordError(): cada erro do servidor vira uma linha em error_events (instrumentation.ts e cron).
 * 2. pendingAlert(): o cron (a cada 5 min) junta os ainda não avisados num resumo — no máximo 1 a cada 30 min — e o
 *    worker.ts manda o e-mail pela Cloudflare (Email Routing), de alertas@rgm.dev.br para ALERT_EMAIL.
 */
const ALERT_EVERY_MS = 30 * 60 * 1000
const KEEP_DAYS = 30

/** Tira usuário/senha de URLs (ex.: string de conexão) e corta o tamanho. */
const clean = (s: string, max: number) => s.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1<oculto>@").slice(0, max)

export async function recordError(source: string, path: string | null, err: unknown, digest?: string | null) {
  try {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    await db.insert(errorEvents).values({
      source,
      path: path ? clean(path.split("?")[0], 200) : null,
      message: clean(message, 500),
      digest: digest ?? (err as { digest?: string } | null)?.digest ?? null,
    })
  } catch (e) {
    // Registrar o erro não pode virar outro erro (ex.: banco fora do ar)
    console.error("alerta: não consegui registrar o erro:", e instanceof Error ? e.message : e)
  }
}

export type Alert = { subject: string; text: string }

/** Resumo dos erros ainda não avisados, se já passou o intervalo mínimo desde o último aviso. Marca como avisados. */
export async function pendingAlert(): Promise<Alert | null> {
  const [{ last }] = await db.select({ last: max(errorEvents.alertedAt) }).from(errorEvents)
  if (last && Date.now() - new Date(last).getTime() < ALERT_EVERY_MS) return null

  const [{ total }] = await db.select({ total: count() }).from(errorEvents).where(isNull(errorEvents.alertedAt))
  if (!total) return null
  const recent = await db.select().from(errorEvents).where(isNull(errorEvents.alertedAt)).orderBy(desc(errorEvents.createdAt)).limit(10)
  const now = new Date()
  await db.update(errorEvents).set({ alertedAt: now }).where(and(isNull(errorEvents.alertedAt), lt(errorEvents.createdAt, now)))

  const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  const lines = recent.map((e) => `• ${when(e.createdAt)} · ${e.source}${e.path ? ` · ${e.path}` : ""}\n  ${e.message}${e.digest ? ` (código ${e.digest})` : ""}`)
  return {
    subject: `RGM Pedidos: ${total} erro${total > 1 ? "s" : ""} no site`,
    text: [
      `O site registrou ${total} erro${total > 1 ? "s" : ""} desde o último aviso.${total > recent.length ? ` Os ${recent.length} mais recentes:` : ""}`,
      "",
      ...lines,
      "",
      "Detalhes: painel da Cloudflare → Workers → rgm-pedidos → Logs (ou peça ao Claude para olhar).",
      "Próximo aviso: só se houver erros novos, no mínimo 30 minutos depois deste.",
    ].join("\n"),
  }
}

/** Faxina: apaga erros com mais de KEEP_DAYS dias. Devolve quantos apagou. */
export async function cleanOldErrors() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000)
  const gone = await db.delete(errorEvents).where(lt(errorEvents.createdAt, cutoff)).returning({ id: errorEvents.id })
  return gone.length
}
