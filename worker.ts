/**
 * Entrada do Worker na Cloudflare (o `main` do wrangler.jsonc).
 * Reaproveita o Worker que o OpenNext gera para o Next (`fetch`) e acrescenta o `scheduled` dos Cron Triggers.
 * Guia: https://opennext.js.org/cloudflare/howtos/custom-worker
 *
 * O cron não roda código próprio aqui: ele chama a rota interna POST /api/cron com o segredo CRON_SECRET, e a
 * manutenção (lib/maintenance.ts, a cada 5 min) e o backup (lib/backup.ts, 1×/dia) rodam dentro do Next.
 * Se a manutenção devolver um alerta de erros (lib/alerts.ts), o e-mail sai daqui: o módulo `cloudflare:email`
 * só existe no Worker, não dentro do Next.
 */
// @ts-ignore -- módulo do runtime da Cloudflare (resolvido pelo wrangler no deploy)
import { EmailMessage } from "cloudflare:email"
// @ts-ignore -- gerado no build (opennextjs-cloudflare build); não existe antes dele
import { default as openNext } from "./.open-next/worker.js"

type EmailBinding = { send(message: unknown): Promise<void> }
type Env = { CRON_SECRET?: string; ALERT_EMAIL?: string; ALERTAS?: EmailBinding }
type Ctx = { waitUntil(p: Promise<unknown>): void }
type Handler = { fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> }

const next = openNext as Handler

/** Mesmo texto do wrangler.jsonc ("triggers.crons"): 06:00 UTC = 03:00 em Brasília */
const BACKUP_CRON = "0 6 * * *"
/** Remetente: precisa ser do domínio com Email Routing ligado (rgm.dev.br) */
const ALERT_FROM = "alertas@rgm.dev.br"

export default {
  fetch: next.fetch,

  async scheduled(controller: { cron: string }, env: Env, ctx: Ctx) {
    const task = controller.cron === BACKUP_CRON ? "backup" : "manutencao"
    if (!env.CRON_SECRET) {
      console.error(`cron: CRON_SECRET não configurado — ${task} não rodou`)
      return
    }
    const request = new Request(`https://cron.internal/api/cron?tarefa=${task}`, { method: "POST", headers: { "x-cron-secret": env.CRON_SECRET } })
    const response = await next.fetch(request, env, ctx)
    if (!response.ok) {
      console.error(`cron: ${task} respondeu ${response.status}`)
      return
    }
    const result = (await response.json().catch(() => ({}))) as { alerta?: { subject: string; text: string } }
    if (result.alerta) await sendAlert(env, result.alerta)
  },
}

/** Manda o alerta para ALERT_EMAIL (segredo; sem ele — como no preview — só registra no log). */
async function sendAlert(env: Env, alert: { subject: string; text: string }) {
  if (!env.ALERT_EMAIL || !env.ALERTAS) {
    console.warn(`alerta (sem e-mail configurado): ${alert.subject}`)
    return
  }
  try {
    await env.ALERTAS.send(new EmailMessage(ALERT_FROM, env.ALERT_EMAIL, mime(ALERT_FROM, env.ALERT_EMAIL, alert.subject, alert.text)))
    console.log(`alerta enviado: ${alert.subject}`)
  } catch (err) {
    console.error("alerta: falha ao enviar o e-mail:", err instanceof Error ? err.message : err)
  }
}

/** E-mail de texto simples em UTF-8 (assunto e corpo em base64, para acentos chegarem certos). */
function mime(from: string, to: string, subject: string, text: string) {
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  const body = b64(text).replace(/.{1,76}/g, "$&\r\n")
  return [
    `From: RGM Pedidos <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@rgm.dev.br>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n")
}
