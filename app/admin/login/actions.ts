"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, asc, count, eq, gt, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { loginAttempts, storeMembers, users } from "@/db/schema"
import { getDummyHash, verifyPassword } from "@/lib/auth/password"
import { createSession } from "@/lib/auth/session"
import { loginSchema } from "@/lib/validations"

export type LoginState = {
  error?: string
  fieldErrors?: { email?: string; password?: string }
  email?: string
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_EMAIL = 5
const MAX_PER_IP = 20

async function clientIp() {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
}

async function failures(key: string) {
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, new Date(Date.now() - WINDOW_MS))))
  return row?.n ?? 0
}

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
  const emailKey = `email:${email}`
  const ipKey = `ip:${await clientIp()}`

  const [byEmail, byIp] = await Promise.all([failures(emailKey), failures(ipKey)])
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
    await db.insert(loginAttempts).values([{ key: emailKey }, { key: ipKey }])
    // Faxina: remove tentativas com mais de 1 dia
    await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
    return { error: "E-mail ou senha incorretos.", email }
  }

  await db.delete(loginAttempts).where(inArray(loginAttempts.key, [emailKey]))

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
