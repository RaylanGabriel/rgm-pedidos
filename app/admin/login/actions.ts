"use server"

import { redirect } from "next/navigation"
import { asc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { loginAttempts, storeMembers, users } from "@/db/schema"
import { getDummyHash, verifyPassword } from "@/lib/auth/password"
import { createSession } from "@/lib/auth/session"
import { clientIpKey, hits, recordHits } from "@/lib/rate-limit-server"
import { TURNSTILE_ERROR, verifyTurnstile } from "@/lib/turnstile"
import { loginSchema } from "@/lib/validations"

export type LoginState = {
  error?: string
  fieldErrors?: { email?: string; password?: string }
  email?: string
}

/*
 * Erros de senha em 15 min. O limite principal é por e-mail + IP: quem erra a senha do dono de OUTRO lugar não
 * bloqueia o dono (antes, 5 erros de qualquer pessoa travavam o e-mail até com a senha certa). Contra ataque vindo
 * de muitos IPs ficam o teto por e-mail (alto) e o Turnstile em cada tentativa.
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_EMAIL_IP = 5
const MAX_PER_IP = 20
const MAX_PER_EMAIL = 50

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  })
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors
    return { fieldErrors: { email: f.email?.[0], password: f.password?.[0] }, email: String(formData.get("email") ?? "") }
  }

  const { email, password } = parsed.data
  // Anti-robô (Turnstile): o widget grava o token no campo oculto cf-turnstile-response do formulário
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), "login"))) return { error: TURNSTILE_ERROR, email }

  const ip = await clientIpKey()
  const emailKey = `email:${email}`
  const emailIpKey = `email-ip:${email}:${ip}`
  const ipKey = `ip:${ip}`

  const [byEmailIp, byIp, byEmail] = await Promise.all([hits(emailIpKey, WINDOW_MS), hits(ipKey, WINDOW_MS), hits(emailKey, WINDOW_MS)])
  if (byEmailIp >= MAX_PER_EMAIL_IP || byIp >= MAX_PER_IP || byEmail >= MAX_PER_EMAIL) {
    return { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente.", email }
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1)

  // Sempre roda o scrypt, mesmo sem usuário, para não revelar pelo tempo quais e-mails existem
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))

  if (!user || !ok) {
    await recordHits(emailIpKey, ipKey, emailKey)
    return { error: "E-mail ou senha incorretos.", email }
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.key, emailIpKey)) // acertou: zera os erros deste aparelho

  // Loja ativa inicial: a primeira em que o usuário é membro
  const [membership] = await db
    .select({ storeId: storeMembers.storeId })
    .from(storeMembers)
    .where(eq(storeMembers.userId, user.id))
    .orderBy(asc(storeMembers.role)) // owner antes de staff
    .limit(1)

  await createSession(user.id, membership?.storeId ?? null)
  redirect("/admin")
}
