/**
 * Backup diário do banco (feito pelo cron às 03:00 de Brasília, ver lib/backup.ts): conferir e restaurar.
 *
 *   npm run backup -- conferir [AAAA-MM-DD]                      mostra o que tem no arquivo × o banco hoje
 *   npm run backup -- restaurar AAAA-MM-DD                        simula (não grava nada)
 *   npm run backup -- restaurar AAAA-MM-DD --valer --sim-producao  restaura a PRODUÇÃO (apaga tudo e põe o backup)
 *
 * `backup` = banco de produção + bucket rgm-pedidos-backups; `backup:teste` = banco de testes + bucket de teste
 * (no teste basta `--valer`). A restauração é uma transação só: se algo falhar, o banco fica como estava.
 * Sessões não estão no backup: depois de restaurar, todos fazem login de novo.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { gunzipSync } from "node:zlib"
import { neon } from "@neondatabase/serverless"
import { BACKUP_FORMAT, backupTables, type BackupFile } from "../lib/backup-tables"

const WRANGLER = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js")
const CHUNK = 500 // linhas por comando de inserção

async function download(bucket: string, date: string): Promise<BackupFile> {
  const dir = mkdtempSync(join(tmpdir(), "rgm-backup-"))
  try {
    const file = join(dir, "backup.json.gz")
    const r = spawnSync(process.execPath, [WRANGLER, "r2", "object", "get", `${bucket}/${date}.json.gz`, "--file", file, "--remote"], { encoding: "utf8" })
    if (r.status !== 0) throw new Error(`não achei o backup ${date} em ${bucket} (${(r.stderr || r.stdout).split("\n").find((l) => /error|✘|not found/i.test(l)) ?? r.status})`)
    let raw = readFileSync(file)
    if (raw[0] === 0x1f && raw[1] === 0x8b) raw = gunzipSync(raw) // o wrangler entrega como foi gravado (gzip)
    const data = JSON.parse(raw.toString("utf8")) as BackupFile
    if (data.format !== BACKUP_FORMAT) throw new Error(`formato ${data.format} não suportado (esperado ${BACKUP_FORMAT})`)
    return data
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { producao: { type: "boolean", default: false }, valer: { type: "boolean", default: false }, "sim-producao": { type: "boolean", default: false } },
  })
  const [cmd, dateArg] = positionals
  const date = dateArg ?? new Date().toISOString().slice(0, 10)
  if (!["conferir", "restaurar"].includes(cmd) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.log("Uso: npm run backup[:teste] -- conferir [AAAA-MM-DD] | restaurar AAAA-MM-DD [--valer] [--sim-producao]")
    return
  }
  const bucket = values.producao ? "rgm-pedidos-backups" : "rgm-pedidos-backups-preview"
  const where = values.producao ? "PRODUÇÃO" : "banco de TESTES"
  const sql = neon(process.env.DATABASE_URL!)

  const backup = await download(bucket, date)
  const tables = backupTables()
  console.log(`\nBackup ${date} (feito em ${backup.createdAt}) × ${where} agora:`)
  for (const t of tables) {
    const [{ n }] = (await sql.query(`SELECT count(*)::int AS n FROM "${t}"`)) as { n: number }[]
    const inFile = backup.tables[t]?.length
    console.log(`  ${t.padEnd(26)} backup ${String(inFile ?? "—").padStart(6)}   banco ${String(n).padStart(6)}${inFile === undefined ? "   (tabela nova, não está no backup)" : ""}`)
  }
  const extra = Object.keys(backup.tables).filter((t) => !tables.includes(t))
  if (extra.length) console.log(`  (no backup e não existem mais no banco: ${extra.join(", ")} — serão ignoradas)`)
  if (cmd === "conferir") return

  if (!values.valer || (values.producao && !values["sim-producao"])) {
    console.log(`\nSimulação: nada foi gravado. Para restaurar de verdade: --valer${values.producao ? " --sim-producao" : ""}`)
    return
  }

  // Uma transação: apaga tudo das tabelas do backup (e o que depende delas, como sessões) e insere na ordem certa
  const present = tables.filter((t) => backup.tables[t])
  const queries = [sql.query(`TRUNCATE ${present.map((t) => `"${t}"`).join(", ")} CASCADE`)]
  for (const t of present) {
    const rows = backup.tables[t]
    for (let i = 0; i < rows.length; i += CHUNK) {
      queries.push(sql.query(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, [JSON.stringify(rows.slice(i, i + CHUNK))]))
    }
  }
  await sql.transaction(queries)
  console.log(`\n✅ ${where} restaurado com o backup de ${date}. Todos precisam fazer login de novo.`)
}

main().catch((err) => {
  console.error("\n❌", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
