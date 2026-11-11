"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { resolveCounterPixAction } from "@/app/admin/actions"

/** Tempo até o Pix vencer (mm:ss). */
export function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const mm = left === null ? "--" : String(Math.floor(left / 60000)).padStart(2, "0")
  const ss = left === null ? "--" : String(Math.floor((left % 60000) / 1000)).padStart(2, "0")
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${left === 0 ? "bg-destructive text-white" : "bg-muted"}`}>
      {left === 0 ? "Pix vencido" : `Vence em ${mm}:${ss}`}
    </span>
  )
}

/** Copiar o código (para mandar no WhatsApp do cliente, se ele preferir). */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        navigator.clipboard?.writeText(code).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
          },
          () => {},
        )
      }
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copied ? "Copiado" : "Copiar código Pix"}
    </Button>
  )
}

const CHOICES = [
  { value: "cash", label: "Dinheiro" },
  { value: "card_on_delivery", label: "Cartão" },
  { value: "pix", label: "Pix na chave da loja" },
] as const

/** Cliente pagou de outro jeito ou desistiu: encerra o QR e segue (ou cancela) o pedido. */
export function CounterPixActions({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const run = (choice: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(choice)
    setMsg(null)
    start(async () => {
      const r = await resolveCounterPixAction(orderId, choice)
      if (!r.ok) setMsg("Não foi possível alterar. Atualize a página.")
      else if (r.paid) setMsg("O Pix acabou de ser pago! Nada foi alterado.")
      router.refresh()
      setBusy(null)
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="text-sm font-semibold">Cliente vai pagar de outro jeito?</p>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <Button key={c.value} type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(c.value)}>
            {busy === c.value && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {c.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">O QR é cancelado e o pedido vai direto para a cozinha.</p>
      <div className="border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => run("cancel", "Cancelar este pedido? O QR do Pix deixa de funcionar.")}
        >
          {busy === "cancel" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Cancelar pedido
        </Button>
      </div>
      {msg && (
        <p role="status" className="text-sm font-medium">
          {msg}
        </p>
      )}
    </div>
  )
}
