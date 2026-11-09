import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida. Copie .env.example para .env.local e preencha com a string do Neon.")
}

export const db = drizzle(neon(process.env.DATABASE_URL), { schema })
export { schema }
