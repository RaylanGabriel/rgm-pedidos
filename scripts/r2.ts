/**
 * Fotos no R2 para os scripts que rodam nesta máquina (demo:loja, demo:seed).
 *
 * Grava e apaga pelo wrangler, com o login da Cloudflare desta máquina: não precisa de chave de acesso ao R2.
 * O bucket e o endereço público vêm do `wrangler.jsonc` (produção = topo; teste = env "preview"), a mesma
 * configuração que o site usa, para os dois nunca divergirem.
 */
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unstable_readConfig } from "wrangler"

const WRANGLER = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js")
const CACHE = "public, max-age=31536000, immutable" // nome é único: pode guardar em cache por 1 ano

export function fotosR2(producao: boolean) {
  const config = unstable_readConfig({ config: "wrangler.jsonc", env: producao ? undefined : "preview" }, { hideWarnings: true })
  const bucket = (config.r2_buckets as { binding: string; bucket_name?: string }[]).find((b) => b.binding === "FOTOS")?.bucket_name
  const base = String(config.vars.FOTOS_PUBLIC_URL ?? "").replace(/\/+$/, "")
  if (!bucket || !base) throw new Error("wrangler.jsonc sem o bucket FOTOS ou sem FOTOS_PUBLIC_URL")

  const wrangler = (args: string[]) => {
    const r = spawnSync(process.execPath, [WRANGLER, "r2", "object", ...args, "--remote"], { encoding: "utf8" })
    if (r.status !== 0) throw new Error(`wrangler r2 object ${args[0]} falhou: ${(r.stderr || r.stdout).split("\n").find((l) => /error|✘/i.test(l)) ?? r.status}`)
  }

  /** É foto deste bucket? (URLs externas e /arquivo.png do site não são nossas) */
  const isOurs = (url: string | null | undefined): url is string => !!url && url.startsWith(`${base}/`)

  return {
    bucket,
    isOurs,
    /** Grava em `<pasta>/<uuid>.webp` e devolve a URL pública. */
    async putWebp(folder: string, bytes: Uint8Array) {
      const key = `${folder}/${randomUUID()}.webp`
      const dir = mkdtempSync(join(tmpdir(), "rgm-r2-"))
      try {
        const file = join(dir, "foto.webp")
        writeFileSync(file, bytes)
        wrangler(["put", `${bucket}/${key}`, "--file", file, "--content-type", "image/webp", "--cache-control", CACHE])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
      return `${base}/${key}`
    },
    /** Apaga as fotos que forem deste bucket; as demais são ignoradas. Devolve quantas apagou. */
    async del(urls: (string | null | undefined)[]) {
      let n = 0
      for (const url of urls.filter(isOurs)) {
        try {
          wrangler(["delete", `${bucket}/${decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0])}`])
          n++
        } catch (e) {
          console.error(`  (não apagou ${url}: ${e instanceof Error ? e.message : e})`)
        }
      }
      return n
    },
  }
}
