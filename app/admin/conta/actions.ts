"use server"

import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema"
import { hashPassword, verifyPassword } from "@/lib/auth/password"
import { deleteOtherSessions, requireSession } from "@/lib/auth/session"
import type { FormState } from "@/lib/form-state"
import { hits, recordHits } from "@/lib/rate-limit-server"
import { newPasswordSchema } from "@/lib/validations"

const WINDOW_MS = 15 * 60 * 1000

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession()
  const key = `pwd:${session.user.id}`
  if ((await hits(key, WINDOW_MS)) >= 5) return { error: "Muitas tentativas. Aguarde 15 minutos." }

  const current = String(fd.get("current") ?? "")
  const next = String(fd.get("next") ?? "")
  const confirm = String(fd.get("confirm") ?? "")

  const parsed = newPasswordSchema.safeParse(next)
  if (!parsed.success) return { fieldErrors: { next: parsed.error.issues[0].message } }
  if (next !== confirm) return { fieldErrors: { confirm: "As senhas não conferem." } }
  if (next === current) return { fieldErrors: { next: "A nova senha precisa ser diferente da atual." } }

  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.user.id)).limit(1)
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    await recordHits(key)
    return { fieldErrors: { current: "Senha atual incorreta." } }
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(users.id, session.user.id))
  // Quem tinha a senha antiga em outro aparelho é desconectado
  await deleteOtherSessions(session.user.id, session.sessionId)

  if (session.user.mustChangePassword) redirect("/admin")
  return { ok: true, message: "Senha alterada. Outros aparelhos conectados foram desconectados." }
}
