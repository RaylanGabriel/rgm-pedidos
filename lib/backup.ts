import "server-only"

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { BACKUP_FORMAT, backupTables, type BackupFile } from "@/lib/backup-tables"

type BackupBucket = {
  put(key: string, value: ReadableStream | Uint8Array, options: { httpMetadata: { contentType: string; contentEncoding: string } }): Promise<unknown>
}

/**
 * Backup diário (cron das 06:00 UTC = 03:00 em Brasília): todas as tabelas em JSON compactado (gzip) no bucket PRIVADO
 * BACKUPS, como `AAAA-MM-DD.json.gz`. O bucket apaga sozinho o que tem mais de 30 dias (regra de ciclo de vida).
 * Restaurar: `npm run backup -- conferir|restaurar` (scripts/backup.ts).
 */
export async function runBackup() {
  const bucket = (getCloudflareContext().env as unknown as { BACKUPS?: BackupBucket }).BACKUPS
  if (!bucket) throw new Error("bucket BACKUPS não configurado")

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    tables: {},
  }
  let rows = 0
  for (const table of backupTables()) {
    // O próprio Postgres monta o JSON de cada linha (datas, números e jsonb exatamente como estão)
    const { rows: out } = await db.execute<{ data: unknown[] }>(sql`SELECT coalesce(json_agg(t), '[]'::json) AS data FROM ${sql.identifier(table)} t`)
    file.tables[table] = out[0]?.data ?? []
    rows += file.tables[table].length
  }

  const json = new TextEncoder().encode(JSON.stringify(file))
  const gz = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer())
  const key = `${file.createdAt.slice(0, 10)}.json.gz`
  await bucket.put(key, gz, { httpMetadata: { contentType: "application/json", contentEncoding: "gzip" } })
  return { arquivo: key, tabelas: Object.keys(file.tables).length, linhas: rows, kb: Math.round(gz.length / 1024) }
}
