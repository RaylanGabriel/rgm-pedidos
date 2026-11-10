import "server-only"

import { randomUUID } from "node:crypto"
import { del, put } from "@vercel/blob"

/**
 * Fotos (itens do cardápio, logo) no Vercel Blob.
 * O navegador já reduz a imagem antes de enviar; aqui validamos de novo pelo conteúdo, não pela extensão.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
]

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

  try {
    const blob = await put(`${folder}/${randomUUID()}.${sig.ext}`, Buffer.from(bytes), {
      access: "public",
      contentType: sig.type,
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365, // nome é único: pode guardar em cache por 1 ano
    })
    return { url: blob.url }
  } catch (e) {
    console.error("Falha ao enviar imagem", e)
    return { error: "Não foi possível enviar a imagem. Tente de novo." }
  }
}

/** Apaga a foto antiga, se for nossa (URLs externas ou /arquivo.png do site são ignoradas). */
export async function deleteImage(url: string | null | undefined) {
  if (!url || !URL.canParse(url) || !new URL(url).hostname.endsWith(".public.blob.vercel-storage.com")) return
  try {
    await del(url)
  } catch (e) {
    console.error("Falha ao apagar imagem", e) // não impede a operação principal
  }
}
