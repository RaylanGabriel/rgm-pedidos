import "server-only"

import { randomUUID } from "node:crypto"
import { getCloudflareContext } from "@opennextjs/cloudflare"

/**
 * Fotos (itens do cardápio, logo, capa): bucket R2 (binding FOTOS), servido em FOTOS_PUBLIC_URL
 * (produção: https://fotos.rgm.dev.br). Chave: `stores/<id>/<pasta>/<uuid>.<ext>`.
 *
 * Só existe dentro da Cloudflare (preview, produção ou `npm run cf:preview`). No `next dev` não há bucket:
 * o envio responde com um aviso e nada é gravado.
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
    return null // fora do Workers (next dev)
  }
}

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

  const storage = r2()
  if (!storage) return { error: "Envio de fotos indisponível aqui (só funciona no site publicado na Cloudflare)." }

  const key = `${folder}/${randomUUID()}.${sig.ext}`
  try {
    await storage.bucket.put(key, bytes, {
      httpMetadata: { contentType: sig.type, cacheControl: `public, max-age=${CACHE_SECONDS}, immutable` },
    })
    return { url: `${storage.base}/${key}` }
  } catch (e) {
    console.error("Falha ao enviar imagem", e)
    return { error: "Não foi possível enviar a imagem. Tente de novo." }
  }
}

/**
 * Apaga a foto antiga, se for deste bucket. URLs externas, /arquivo.png do site e fotos de outro bucket são ignoradas
 * (ex.: depois de um `db:preview:reset` o banco de testes aponta para fotos.rgm.dev.br, que o preview nunca apaga).
 */
export async function deleteImage(url: string | null | undefined) {
  const storage = r2()
  if (!url || !storage || !url.startsWith(`${storage.base}/`)) return
  try {
    await storage.bucket.delete(decodeURIComponent(url.slice(storage.base.length + 1).split(/[?#]/)[0]))
  } catch (e) {
    console.error("Falha ao apagar imagem", e) // não impede a operação principal
  }
}
