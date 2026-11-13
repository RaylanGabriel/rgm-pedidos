import { createHash, timingSafeEqual } from "node:crypto"
import { runMaintenance } from "@/lib/maintenance"

/**
 * Manutenção agendada. Só o próprio Worker chama (worker.ts, no cron), mandando o segredo CRON_SECRET.
 * Sem o segredo certo — ou sem CRON_SECRET configurado — responde 404, como se a rota não existisse.
 */
export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-cron-secret"))) return new Response("Not Found", { status: 404 })
  const result = await runMaintenance()
  console.log("cron:", JSON.stringify(result))
  return Response.json(result)
}

function authorized(got: string | null) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 32 || !got) return false
  // Compara os hashes: mesmo tamanho sempre, e o tempo não revela quantos caracteres batem
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(got), digest(secret))
}
