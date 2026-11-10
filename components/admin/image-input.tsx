"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

const MAX_SIDE = 1200

/** Reduz a foto no navegador (celular tira fotos de 3–8 MB) para WebP/JPEG de ~100–300 KB. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#fff" // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.82))
  let blob = await toBlob("image/webp")
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg") // navegadores sem WebP
  if (!blob) throw new Error("encode")
  const ext = blob.type === "image/webp" ? "webp" : "jpg"
  return new File([blob], `foto.${ext}`, { type: blob.type })
}

/**
 * Campo de foto para formulários de server action.
 * Envia o arquivo em `name` e, se o usuário remover a foto atual, `removeName=on`.
 */
export function ImageInput({
  name = "image",
  removeName = "removeImage",
  label = "Foto",
  currentUrl,
  aspect = "aspect-[4/3]",
  hint = "JPG, PNG ou WebP. A foto é reduzida automaticamente.",
  error,
}: {
  name?: string
  removeName?: string
  label?: string
  currentUrl?: string | null
  aspect?: string
  hint?: string
  error?: string
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  // Formulário reiniciado depois de salvar → limpa a prévia
  useEffect(() => {
    const form = input.current?.form
    if (!form) return
    const onReset = () => {
      setPreview(null)
      setRemoved(false)
      setLocalError(null)
    }
    form.addEventListener("reset", onReset)
    return () => form.removeEventListener("reset", onReset)
  }, [])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setLocalError(null)
    if (!file) return
    setBusy(true)
    try {
      const small = await shrink(file)
      const dt = new DataTransfer()
      dt.items.add(small)
      e.target.files = dt.files
      setPreview(URL.createObjectURL(small))
    } catch {
      // Sem suporte para reduzir (ou formato que o navegador não abre): envia o original se couber
      if (file.size > 2 * 1024 * 1024) {
        e.target.value = ""
        setLocalError("Não foi possível processar esta imagem. Tente outra foto (JPG ou PNG).")
      } else setPreview(URL.createObjectURL(file))
    } finally {
      setBusy(false)
      setRemoved(false)
    }
  }

  const clearPick = () => {
    if (input.current) input.current.value = ""
    setPreview(null)
  }

  const shown = preview ?? (removed ? null : currentUrl)
  const msg = localError ?? error

  return (
    <div>
      <Label htmlFor={id} className="mb-1.5">
        {label}
      </Label>
      <div className="flex items-start gap-4">
        <div className={`relative w-32 shrink-0 overflow-hidden rounded-lg border bg-muted ${aspect}`}>
          {busy ? (
            <Loader2 className="absolute inset-0 m-auto w-6 h-6 animate-spin text-muted-foreground" />
          ) : shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="absolute inset-0 m-auto w-8 h-8 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="space-y-2 min-w-0">
          <input
            ref={input}
            id={id}
            name={name}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            onChange={onPick}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
            aria-invalid={!!msg}
          />
          <div className="flex flex-wrap gap-2">
            {preview && (
              <Button type="button" variant="ghost" size="sm" onClick={clearPick}>
                <Undo2 className="w-4 h-4" />
                Desfazer
              </Button>
            )}
            {!preview && currentUrl && !removed && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoved(true)}>
                <Trash2 className="w-4 h-4" />
                Remover foto
              </Button>
            )}
            {removed && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoved(false)}>
                <Undo2 className="w-4 h-4" />
                Manter foto
              </Button>
            )}
          </div>
          {removed && <input type="hidden" name={removeName} value="on" />}
          {msg ? <p className="text-sm text-destructive">{msg}</p> : <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
