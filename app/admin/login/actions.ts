"use server"

import { redirect } from "next/navigation"
import { asc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { loginAttempts, storeMembers, users } from "@/db/schema"
import { getDummyHash, verifyPassword } from "@/lib/auth/password"
import { createSession } from "@/lib/auth/session"
import { clientIp, hits, recordHits } from "@/lib/rate-limit-server"
import { TURNSTILE_ERROR, verifyTurnstile } from "@/lib/turnstile"
import { loginSchema } from "@/lib/validations"

export type LoginState = {
  error?: string
  fieldErrors?: { email?: string; password?: string }
  email?: string
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_EMAIL = 5
const MAX_PER_IP = 20

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

  const emailKey = `email:${email}`
  const ipKey = `ip:${await clientIp()}`

  const [byEmail, byIp] = await Promise.all([hits(emailKey, WINDOW_MS), hits(ipKey, WINDOW_MS)])
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) {
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
    await recordHits(emailKey, ipKey)
    return { error: "E-mail ou senha incorretos.", email }
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.key, emailKey))

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
