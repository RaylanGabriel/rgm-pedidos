/**
 * Entrada do Worker na Cloudflare (o `main` do wrangler.jsonc).
 * Reaproveita o Worker que o OpenNext gera para o Next (`fetch`) e acrescenta o `scheduled` dos Cron Triggers.
 * Guia: https://opennext.js.org/cloudflare/howtos/custom-worker
 *
 * O cron não roda código próprio aqui: ele chama a rota interna POST /api/cron com o segredo CRON_SECRET, e a
 * manutenção (lib/maintenance.ts, a cada 5 min) e o backup (lib/backup.ts, 1×/dia) rodam dentro do Next.
 */
// @ts-ignore -- gerado no build (opennextjs-cloudflare build); não existe antes dele
import { default as openNext } from "./.open-next/worker.js"

type Env = { CRON_SECRET?: string }
type Ctx = { waitUntil(p: Promise<unknown>): void }
type Handler = { fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> }

const next = openNext as Handler

/** Mesmo texto do wrangler.jsonc ("triggers.crons"): 06:00 UTC = 03:00 em Brasília */
const BACKUP_CRON = "0 6 * * *"

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
    if (!response.ok) console.error(`cron: ${task} respondeu ${response.status}`)
  },
}
