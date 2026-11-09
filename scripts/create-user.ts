/**
 * Cria (ou atualiza a senha de) um usuário e o vincula a uma loja.
 *
 * Uso:
 *   npm run user:create -- --email voce@email.com --name "Seu Nome" --store mr-smash --superadmin
 *
 * Opções:
 *   --email       obrigatório
 *   --name        obrigatório na criação
 *   --store       slug da loja para vincular (opcional)
 *   --role        owner | staff (padrão: owner)
 *   --superadmin  marca como dono da plataforma
 * A senha é pedida no terminal (não aparece na tela nem fica no histórico).
 */
import { createInterface } from "node:readline"
import { parseArgs } from "node:util"
import { eq, sql } from "drizzle-orm"
import { db } from "../db"
import { storeMembers, stores, users } from "../db/schema"
import { hashPassword } from "../lib/auth/password"
import { newPasswordSchema } from "../lib/validations"

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    // Esconde o que é digitado
    ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write("\n")
      resolve(answer)
    })
    muted = true
  })
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      store: { type: "string" },
      role: { type: "string", default: "owner" },
      superadmin: { type: "boolean", default: false },
    },
  })

  const email = values.email?.trim().toLowerCase()
  if (!email) throw new Error("Informe --email")
  const role = values.role === "staff" ? "staff" : "owner"

  const password = await askHidden("Senha (mín. 8 caracteres): ")
  const parsed = newPasswordSchema.safeParse(password)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  if ((await askHidden("Confirme a senha: ")) !== password) throw new Error("As senhas não conferem")

  const passwordHash = await hashPassword(password)
  const [existing] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1)

  let userId: string
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, ...(values.superadmin ? { isSuperadmin: true } : {}), ...(values.name ? { name: values.name } : {}) })
      .where(eq(users.id, existing.id))
    userId = existing.id
    console.log(`Usuário ${email} atualizado.`)
  } else {
    if (!values.name) throw new Error("Informe --name para criar um usuário novo")
    const [created] = await db
      .insert(users)
      .values({ email, name: values.name, passwordHash, isSuperadmin: values.superadmin })
      .returning({ id: users.id })
    userId = created.id
    console.log(`Usuário ${email} criado.`)
  }

  if (values.store) {
    const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, values.store)).limit(1)
    if (!store) throw new Error(`Loja "${values.store}" não encontrada`)
    await db
      .insert(storeMembers)
      .values({ userId, storeId: store.id, role })
      .onConflictDoUpdate({ target: [storeMembers.userId, storeMembers.storeId], set: { role } })
    console.log(`Vinculado à loja ${values.store} como ${role}.`)
  }
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err)
  process.exit(1)
})
