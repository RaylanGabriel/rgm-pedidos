"use client"

import { useEffect, useState } from "react"
import { Check, Copy, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/order-shared"

/**
 * Pagamento Pix do pedido: QR (para pagar de outro aparelho) + copia e cola (no mesmo celular) + prazo.
 * A página se atualiza sozinha e muda para "pago" quando o Mercado Pago confirmar.
 */
export function PixPayment({ code, qrSvg, expiresAt, total }: { code: string; qrSvg: string; expiresAt: string; total: number }) {
  const [copied, setCopied] = useState(false)
  const [left, setLeft] = useState<number | null>(null)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [expiresAt])

  // No computador mostra o QR direto (o cliente paga com o celular); no celular, o copia e cola vem primeiro
  useEffect(() => {
    setShowQr(window.matchMedia("(min-width: 640px)").matches)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const mm = left === null ? "--" : String(Math.floor(left / 60000)).padStart(2, "0")
  const ss = left === null ? "--" : String(Math.floor((left % 60000) / 1000)).padStart(2, "0")
  const expired = left === 0

  return (
    <section aria-labelledby="pix-title" className="space-y-4 rounded-3xl border-2 border-primary bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="pix-title" className="text-lg font-extrabold">
            Pague com Pix para confirmar
          </h2>
          <p className="text-sm text-muted-foreground">
            Total: <strong className="text-foreground">{formatBRL(total)}</strong> · a loja começa a preparar assim que o pagamento cair.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${expired ? "bg-destructive text-white" : "bg-muted"}`}
          aria-label={expired ? "Pix vencido" : `Vence em ${mm} minutos e ${ss} segundos`}
        >
          {expired ? "vencido" : `${mm}:${ss}`}
        </span>
      </div>

      <ol className="space-y-1 text-sm text-muted-foreground">
        <li>1. Toque em <strong className="text-foreground">Copiar código Pix</strong>.</li>
        <li>2. Abra o app do seu banco → Pix → <strong className="text-foreground">Pix copia e cola</strong>.</li>
        <li>3. Cole o código e confirme. Esta tela atualiza sozinha.</li>
      </ol>

      <Button type="button" size="lg" className="h-12 w-full rounded-full text-base font-bold" onClick={copy} disabled={expired}>
        {copied ? <Check className="h-5 w-5" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
        {copied ? "Código copiado!" : "Copiar código Pix"}
      </Button>
      <p className="sr-only" role="status">
        {copied ? "Código Pix copiado" : ""}
      </p>

      <details open={showQr} onToggle={(e) => setShowQr((e.target as HTMLDetailsElement).open)} className="rounded-2xl border">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
          <QrCode className="h-4 w-4" aria-hidden />
          {showQr ? "Esconder QR code" : "Mostrar QR code (pagar com outro celular)"}
        </summary>
        <div className="flex justify-center px-4 pb-4">
          {/* SVG gerado no servidor a partir do código do Mercado Pago */}
          <div className="w-56 max-w-full rounded-xl bg-white p-3" role="img" aria-label="QR code do Pix" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </div>
      </details>

      <p className="break-all rounded-xl bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{code}</p>
    </section>
  )
}
