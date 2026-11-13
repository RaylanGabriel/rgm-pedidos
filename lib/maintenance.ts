import "server-only"

import { lt } from "drizzle-orm"
import { db } from "@/db"
import { loginAttempts, sessions } from "@/db/schema"
import { cleanOldErrors, pendingAlert, recordError, type Alert } from "@/lib/alerts"
import { cancelOverduePix } from "@/lib/mercadopago"
import { autoCompleteDeliveries } from "@/lib/orders"

/**
 * Manutenção de todas as lojas, chamada pelo cron da Cloudflare a cada 5 min (worker.ts → POST /api/cron).
 * As mesmas rotinas continuam rodando ao abrir a cozinha/pedido; aqui elas rodam mesmo com tudo fechado.
 * Cada passo é independente: a falha de um não impede os outros (e entra no alerta de erros).
 * Por último, devolve o alerta de erros pendente (se houver) para o worker.ts mandar por e-mail.
 */
export async function runMaintenance() {
  const result: Record<string, number | string> & { alerta?: Alert } = {}
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      result[name] = await fn()
    } catch (err) {
      result[name] = "erro"
      console.error(`cron: ${name} falhou:`, err instanceof Error ? err.message : err)
      await recordError("cron", name, err)
    }
  }

  await step("entregasFechadas", () => autoCompleteDeliveries())
  await step("pixVencidosCancelados", () => cancelOverduePix())
  await step("sessoesVencidasApagadas", async () => (await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id })).length)
  await step("tentativasAntigasApagadas", async () => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000) // a política de privacidade promete apagar em até 24 h
    return (await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, dayAgo)).returning({ id: loginAttempts.id })).length
  })
  await step("errosAntigosApagados", () => cleanOldErrors())

  try {
    const alert = await pendingAlert()
    if (alert) result.alerta = alert
  } catch (err) {
    console.error("cron: não consegui montar o alerta de erros:", err instanceof Error ? err.message : err)
  }
  return result
}
