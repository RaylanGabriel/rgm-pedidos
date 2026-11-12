import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

function connect() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL não definida. Copie .env.example para .env.local e preencha com a string do Neon.")
  }
  return drizzle(neon(url), { schema })
}

type Db = ReturnType<typeof connect>
let instance: Db | undefined

/**
 * Conexão criada no primeiro uso, não na importação: na Cloudflare o build roda sem DATABASE_URL
 * (os segredos só existem no Worker em execução), e o Next importa as rotas durante o build.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= connect()
    const value = Reflect.get(instance, prop, instance)
    return typeof value === "function" ? value.bind(instance) : value
  },
})

export { schema }
