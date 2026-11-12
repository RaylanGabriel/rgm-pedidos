import "server-only"

import { randomUUID } from "node:crypto"
import { getCloudflareContext } from "@opennextjs/cloudflare"

/**
 * Fotos (itens do cardápio, logo, capa).
 * - Na Cloudflare: bucket R2 (binding FOTOS), servido em FOTOS_PUBLIC_URL (ex.: https://fotos.rgm.dev.br).
 * - Na Vercel / `next dev` (sem o binding): Vercel Blob, como antes. Fica até o fim da migração.
 * As chaves são iguais nos dois (`stores/<id>/<pasta>/<uuid>.<ext>`), então copiar Blob → R2 é só trocar a origem da URL.
 *
 * O `@vercel/blob` só é carregado quando usado: ele traz o `undici`, que compila WebAssembly ao carregar — o Workers
 * proíbe isso. Por isso, na Cloudflare, fotos antigas do Blob não são apagadas (o Blob inteiro sai no fim da migração).
 *
 * O navegador já reduz a imagem antes de enviar; aqui validamos de novo pelo conteúdo, não pela extensão.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const CACHE_SECONDS = 60 * 60 * 24 * 365 // nome é único: pode guardar em cache por 1 ano

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
]

/** O pedaço da API do R2 que usamos (evita depender dos tipos gerados do Workers). */
type PhotoBucket = {
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>
  delete(key: string): Promise<void>
}

/** Bucket R2 + endereço público, se estivermos rodando na Cloudflare com tudo configurado. */
function r2(): { bucket: PhotoBucket; base: string } | null {
  const base = (process.env.FOTOS_PUBLIC_URL ?? "").trim().replace(/\/+$/, "")
  if (!base) return null
  try {
    const bucket = (getCloudflareContext().env as unknown as { FOTOS?: PhotoBucket }).FOTOS
    return bucket ? { bucket, base } : null
  } catch {
    return null // fora do Workers (Vercel, next dev)
  }
}

const isVercelBlob = (url: URL) => url.hostname.endsWith(".public.blob.vercel-storage.com")

export type UploadResult = { url: string } | { error: string }

/** `File` não vazio vindo do formulário, ou null se nenhum arquivo foi escolhido. */
export function fileFrom(fd: FormData, key: string): File | null {
  const f = fd.get(key)
  return f instanceof File && f.size > 0 ? f : null
}

export async function uploadImage(file: File, folder: string): Promise<UploadResult> {
  if (file.size > MAX_IMAGE_BYTES) return { error: "Imagem muito grande (máx. 2 MB)." }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sig = SIGNATURES.find((s) => s.test(bytes))
  if (!sig) return { error: "Formato não suportado. Use JPG, PNG ou WebP." }

  const key = `${folder}/${randomUUID()}.${sig.ext}`
  try {
    const storage = r2()
    if (storage) {
      await storage.bucket.put(key, bytes, {
        httpMetadata: { contentType: sig.type, cacheControl: `public, max-age=${CACHE_SECONDS}, immutable` },
      })
      return { url: `${storage.base}/${key}` }
    }
    const { put } = await import("@vercel/blob")
    const blob = await put(key, Buffer.from(bytes), {
      access: "public",
      contentType: sig.type,
      addRandomSuffix: false,
      cacheControlMaxAge: CACHE_SECONDS,
    })
    return { url: blob.url }
  } catch (e) {
    console.error("Falha ao enviar imagem", e)
    return { error: "Não foi possível enviar a imagem. Tente de novo." }
  }
}

/** Apaga a foto antiga, se for nossa (URLs externas ou /arquivo.png do site são ignoradas). */
export async function deleteImage(url: string | null | undefined) {
  if (!url || !URL.canParse(url)) return
  try {
    const storage = r2()
    if (storage) {
      if (url.startsWith(`${storage.base}/`)) {
        await storage.bucket.delete(decodeURIComponent(url.slice(storage.base.length + 1).split(/[?#]/)[0]))
      }
      return // foto antiga no Vercel Blob: fica até o Blob ser apagado
    }
    if (isVercelBlob(new URL(url)) && process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob")
      await del(url)
    }
  } catch (e) {
    console.error("Falha ao apagar imagem", e) // não impede a operação principal
  }
}
