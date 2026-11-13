/**
 * Tabelas do backup diário, na ordem em que podem ser restauradas (quem é referenciado vem antes de quem referencia).
 * A lista sai do próprio schema: tabela nova entra no backup sozinha. Usado pelo cron (lib/backup.ts) e pelo script
 * de restauração (scripts/backup.ts), então os dois sempre concordam.
 */
import { is } from "drizzle-orm"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import * as schema from "@/db/schema"

/**
 * Descartáveis: sessões (todos fazem login de novo; equipe e clientes), tentativas e códigos de login, cache de
 * endereços e registro de erros.
 */
const SKIP = new Set(["sessions", "customer_sessions", "customer_login_codes", "login_attempts", "geocode_cache", "error_events"])

export const BACKUP_FORMAT = 1

export function backupTables(): string[] {
  const tables = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable))
  const deps = new Map<string, Set<string>>()
  for (const t of tables) {
    const cfg = getTableConfig(t)
    if (SKIP.has(cfg.name)) continue
    const refs = new Set(cfg.foreignKeys.map((fk) => getTableConfig(fk.reference().foreignTable).name).filter((n) => n !== cfg.name && !SKIP.has(n)))
    deps.set(cfg.name, refs)
  }
  // Ordenação topológica (Kahn); ordem alfabética só para o resultado ser estável
  const order: string[] = []
  const pending = new Map([...deps].map(([n, d]) => [n, new Set(d)]))
  while (pending.size) {
    const ready = [...pending].filter(([, d]) => d.size === 0).map(([n]) => n).sort()
    if (!ready.length) throw new Error(`backup: dependência circular entre ${[...pending.keys()].join(", ")}`)
    for (const n of ready) {
      order.push(n)
      pending.delete(n)
      for (const d of pending.values()) d.delete(n)
    }
  }
  return order
}

export type BackupFile = {
  format: number
  createdAt: string
  tables: Record<string, unknown[]>
}
