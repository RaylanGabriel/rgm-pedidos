import "server-only"

import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { and, desc, eq, gt } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { customerLoginCodes } from "@/db/schema"
import { createCustomerSession, upsertCustomer } from "@/lib/auth/customer"
import { emailConfigured, loginCodeEmail, sendEmail } from "@/lib/email"
import { clientIp, rateLimit } from "@/lib/rate-limit-server"

/*
 * Entrar com código de 6 dígitos por e-mail (sem senha). Proteções:
 * - o código vale 10 min e aceita até 5 tentativas; no banco fica só o sha256;
 * - limite de envios: 3 por e-mail a cada 15 min e 10 por IP a cada hora;
 * - a resposta do pedido de código é a mesma para qualquer e-mail (não revela quem tem conta).
 */

const CODE_MINUTES = 10
const MAX_ATTEMPTS = 5
const hash = (s: string) => createHash("sha256").update(s).digest()

export const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(200, "E-mail muito longo")

export async function requestLoginCode(rawEmail: string, storeName: string | null): Promise<{ ok: true; email: string } | { error: string }> {
  const parsed = emailSchema.safeParse(rawEmail)
  if (!parsed.success) return { error: "Confira o e-mail." }
  const email = parsed.data
  if (!emailConfigured()) return { error: "Entrar por e-mail ainda não está disponível. Use o Google ou peça sem conta." }

  const ip = await clientIp()
  if (!(await rateLimit(`code-ip:${ip}`, 10, 60 * 60 * 1000)) || !(await rateLimit(`code-email:${email}`, 3, 15 * 60 * 1000))) {
    return { error: "Muitos códigos pedidos. Espere alguns minutos e tente de novo." }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await db.insert(customerLoginCodes).values({
    email,
    codeHash: hash(code).toString("hex"),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
  })
  const msg = loginCodeEmail(code, storeName)
  if (!(await sendEmail(email, msg.subject, msg.html, msg.text))) return { error: "Não conseguimos mandar o e-mail agora. Tente de novo em instantes." }
  return { ok: true, email }
}

/** Confere o código mais recente do e-mail; certo → cria/acha a conta e entra. */
export async function verifyLoginCode(rawEmail: string, rawCode: string): Promise<{ ok: true } | { error: string }> {
  const email = emailSchema.safeParse(rawEmail)
  const code = rawCode.replace(/\D/g, "")
  if (!email.success || code.length !== 6) return { error: "Digite os 6 números do código." }

  const [row] = await db
    .select()
    .from(customerLoginCodes)
    .where(and(eq(customerLoginCodes.email, email.data), gt(customerLoginCodes.expiresAt, new Date())))
    .orderBy(desc(customerLoginCodes.createdAt))
    .limit(1)
  if (!row || row.attempts >= MAX_ATTEMPTS) return { error: "O código venceu ou teve tentativas demais. Peça um novo." }

  const ok = timingSafeEqual(hash(code), Buffer.from(row.codeHash, "hex"))
  if (!ok) {
    await db.update(customerLoginCodes).set({ attempts: row.attempts + 1 }).where(eq(customerLoginCodes.id, row.id))
    const left = MAX_ATTEMPTS - row.attempts - 1
    return { error: left > 0 ? `Código errado. Você tem mais ${left} tentativa${left > 1 ? "s" : ""}.` : "Código errado. Peça um novo." }
  }

  await db.delete(customerLoginCodes).where(eq(customerLoginCodes.email, email.data)) // usado: nenhum código antigo vale mais
  await createCustomerSession(await upsertCustomer(email.data))
  return { ok: true }
}
