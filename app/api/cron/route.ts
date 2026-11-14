import { createHash, timingSafeEqual } from "node:crypto"
import { recordError, safeErrorText } from "@/lib/alerts"
import { runBackup } from "@/lib/backup"
import { runMaintenance } from "@/lib/maintenance"

/**
 * Tarefas agendadas. Só o próprio Worker chama (worker.ts, no cron), mandando o segredo CRON_SECRET.
 * Sem o segredo certo — ou sem CRON_SECRET configurado — responde 404, como se a rota não existisse.
 * ?tarefa=manutencao (a cada 5 min, padrão) | backup (1×/dia)
 */
export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-cron-secret"))) return new Response("Not Found", { status: 404 })
  const task = new URL(request.url).searchParams.get("tarefa") ?? "manutencao"
  try {
    // Manutenção pode devolver `alerta` (resumo de erros): o worker.ts manda por e-mail
    const result = task === "backup" ? await runBackup() : await runMaintenance()
    const { alerta, ...summary } = result as typeof result & { alerta?: { subject: string } }
    console.log(`cron ${task}:`, JSON.stringify(summary), alerta ? `| alerta: ${alerta.subject}` : "")
    return Response.json(result)
  } catch (err) {
    console.error(`cron ${task} falhou:`, safeErrorText(err))
    await recordError("cron", task, err)
    return Response.json({ erro: true }, { status: 500 })
  }
}

function authorized(got: string | null) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 32 || !got) return false
  // Compara os hashes: mesmo tamanho sempre, e o tempo não revela quantos caracteres batem
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(got), digest(secret))
}
