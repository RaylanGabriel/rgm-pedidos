// Executa um arquivo .sql no banco do DATABASE_URL.
// Uso: node --env-file=.env.local db/run-sql.mjs db/seed.sql
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const file = process.argv[2]
if (!file) throw new Error("Informe o arquivo .sql")
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não definida")

const sql = neon(process.env.DATABASE_URL)
await sql.query(readFileSync(file, "utf8"))
console.log(`OK: ${file}`)
