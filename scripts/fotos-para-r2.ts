/**
 * Migração das fotos do Vercel Blob para o R2 (fase 4 de docs/ARQUITETURA-CLOUDFLARE.md).
 *
 * Uso:
 *   npm run fotos:r2 -- copiar                 copia para o R2 cada foto do Blob usada no banco (pula as que já estão iguais)
 *   npm run fotos:r2 -- conferir               compara o SHA-256 de cada foto no R2 com a original
 *   npm run fotos:r2 -- trocar-urls            mostra quantas URLs trocaria (não grava nada)
 *   npm run fotos:r2 -- trocar-urls --valer    salva backup em backups/ e troca as URLs para FOTOS_URL
 *   npm run fotos:r2 -- desfazer <backup.json> volta as URLs do backup (só onde ainda estão como o script deixou)
 *
 * `fotos:r2` usa o banco de produção e o bucket rgm-pedidos-fotos; `fotos:r2:teste` usa o banco preview e o
 * bucket rgm-pedidos-fotos-preview. A chave no R2 é o mesmo caminho do Blob (stores/<id>/...), então trocar a URL é só
 * trocar a origem. Envio pelo wrangler (login da Cloudflare desta máquina); nenhum segredo é impresso.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "../db"
import { menuItems, stores } from "../db/schema"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { producao: { type: "boolean", default: false }, valer: { type: "boolean", default: false } },
})
const [mode, backupFile] = positionals
const PRODUCAO = values.producao
const BUCKET = PRODUCAO ? "rgm-pedidos-fotos" : "rgm-pedidos-fotos-preview"
const FOTOS_URL = PRODUCAO ? "https://fotos.rgm.dev.br" : "https://pub-7178be0af245478695ef3fdfe20096af.r2.dev"
const CACHE = "public, max-age=31536000, immutable"
const WRANGLER = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js")

const isBlob = (url: string) => URL.canParse(url) && new URL(url).hostname.endsWith(".public.blob.vercel-storage.com")
const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname.slice(1))
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")

type Ref = { table: "stores" | "menu_items"; column: "logo_url" | "cover_url" | "image_url"; id: string; url: string }

/** Todas as fotos referenciadas no banco (logo, capa, itens). */
async function references(): Promise<Ref[]> {
  const st = await db.select({ id: stores.id, logo: stores.logoUrl, cover: stores.coverUrl }).from(stores)
  const items = await db.select({ id: menuItems.id, url: menuItems.imageUrl }).from(menuItems).where(isNotNull(menuItems.imageUrl))
  return [
    ...st.flatMap((s) => [
      ...(s.logo ? [{ table: "stores", column: "logo_url", id: s.id, url: s.logo } as Ref] : []),
      ...(s.cover ? [{ table: "stores", column: "cover_url", id: s.id, url: s.cover } as Ref] : []),
    ]),
    ...items.map((i) => ({ table: "menu_items", column: "image_url", id: i.id, url: i.url! }) as Ref),
  ]
}

function wrangler(args: string[]) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 })
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr?.toString() ?? "" }
}

/** Conteúdo atual no R2 (ou null se não existe). */
function r2Get(key: string, dir: string): Uint8Array | null {
  const file = join(dir, "get.bin")
  rmSync(file, { force: true })
  const r = wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--file", file, "--remote"])
  if (!r.ok) return null
  try {
    return new Uint8Array(readFileSync(file))
  } catch {
    return null
  }
}

async function download(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`download ${res.status}`)
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "application/octet-stream" }
}

async function copy(refs: Ref[], verifyOnly: boolean) {
  const urls = [...new Set(refs.map((r) => r.url).filter(isBlob))]
  console.log(`${urls.length} foto(s) do Blob → bucket ${BUCKET}${verifyOnly ? " (só conferir)" : ""}`)
  const dir = mkdtempSync(join(tmpdir(), "fotos-r2-"))
  const tally = { copiadas: 0, iguais: 0, divergentes: 0, erros: 0 }
  try {
    for (const [i, url] of urls.entries()) {
      const key = keyOf(url)
      const label = `[${i + 1}/${urls.length}] ${key.replace(/[0-9a-f-]{36}/g, "<id>")}`
      try {
        const src = await download(url)
        const current = r2Get(key, dir)
        if (current && sha(current) === sha(src.bytes)) {
          tally.iguais++
          console.log(`${label}: já está no R2 (igual)`)
          continue
        }
        if (verifyOnly) {
          tally.divergentes++
          console.log(`${label}: ${current ? "DIFERENTE no R2" : "FALTA no R2"}`)
          continue
        }
        const file = join(dir, "put.bin")
        writeFileSync(file, src.bytes)
        const put = wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", src.type, "--cache-control", CACHE, "--remote"])
        if (!put.ok) throw new Error(put.stderr.split("\n").find((l) => /error/i.test(l)) ?? "wrangler put falhou")
        const check = r2Get(key, dir)
        if (!check || sha(check) !== sha(src.bytes)) throw new Error("conferência depois do envio falhou")
        tally.copiadas++
        console.log(`${label}: copiada (${src.type}, ${src.bytes.length} bytes)`)
      } catch (e) {
        tally.erros++
        console.log(`${label}: ERRO ${e instanceof Error ? e.message : e}`)
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log(JSON.stringify(tally))
  if (tally.erros || tally.divergentes) process.exitCode = 1
}

async function setUrl(ref: Pick<Ref, "table" | "column" | "id">, from: string, to: string) {
  if (ref.table === "menu_items") {
    return db.update(menuItems).set({ imageUrl: to }).where(and(eq(menuItems.id, ref.id), eq(menuItems.imageUrl, from))).returning({ id: menuItems.id })
  }
  const col = ref.column === "logo_url" ? stores.logoUrl : stores.coverUrl
  const set = ref.column === "logo_url" ? { logoUrl: to } : { coverUrl: to }
  return db.update(stores).set(set).where(and(eq(stores.id, ref.id), eq(col, from))).returning({ id: stores.id })
}

async function swap(refs: Ref[]) {
  const todo = refs.filter((r) => isBlob(r.url)).map((r) => ({ ...r, to: FOTOS_URL + new URL(r.url).pathname }))
  console.log(`${todo.length} URL(s) do Blob → ${FOTOS_URL}`)
  if (!values.valer) {
    console.log("Nada gravado. Rode de novo com --valer (depois de `copiar` e `conferir` sem erros).")
    return
  }
  mkdirSync("backups", { recursive: true })
  const file = join("backups", `fotos-urls-${PRODUCAO ? "producao" : "preview"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  writeFileSync(file, JSON.stringify(todo.map(({ table, column, id, url, to }) => ({ table, column, id, from: url, to })), null, 2))
  console.log(`backup: ${file}`)
  let n = 0
  for (const r of todo) n += (await setUrl(r, r.url, r.to)).length
  console.log(`${n} URL(s) trocada(s)`)
}

async function undo(file: string) {
  const rows = JSON.parse(readFileSync(file, "utf8")) as (Pick<Ref, "table" | "column" | "id"> & { from: string; to: string })[]
  let n = 0
  for (const r of rows) n += (await setUrl(r, r.to, r.from)).length
  console.log(`${n} de ${rows.length} URL(s) voltaram ao Blob`)
}

async function main() {
  console.log(`banco: ${PRODUCAO ? "PRODUÇÃO" : "preview"} | bucket: ${BUCKET}`)
  if (mode === "copiar") await copy(await references(), false)
  else if (mode === "conferir") await copy(await references(), true)
  else if (mode === "trocar-urls") await swap(await references())
  else if (mode === "desfazer" && backupFile) await undo(backupFile)
  else console.log("Modos: copiar | conferir | trocar-urls [--valer] | desfazer <backup.json>")
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  },
)
