"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { whatsappLink } from "@/lib/links"
import type { OrderWithItemsView } from "@/lib/order-shared"
import { cn } from "@/lib/utils"

/** Logo do WhatsApp (a lucide não tem). */
function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.45-5.03c0-5.2 4.24-9.44 9.45-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.44-9.45 9.44m8.04-17.48A11.3 11.3 0 0 0 12.04.7C5.78.7.68 5.8.68 12.06c0 2 .52 3.96 1.52 5.68L.6 23.6l6-1.57a11.3 11.3 0 0 0 5.43 1.38h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.03-1.18-5.89-3.32-8.03" />
    </svg>
  )
}

type Kind = "ready" | "out" | "chat"

/** Qual aviso faz sentido agora: pronto para retirar/servir, saiu para entrega, ou só conversar. */
export function notifyKind(o: Pick<OrderWithItemsView, "status" | "type">): Kind {
  if (o.status === "ready" && o.type !== "delivery") return "ready"
  if (o.status === "out_for_delivery") return "out"
  return "chat"
}

/** Mensagem pronta (o funcionário ainda pode editar no WhatsApp antes de enviar). */
export function notifyMessage(o: OrderWithItemsView, storeName: string, kind: Kind, origin: string) {
  const first = o.customerName.trim().split(/\s+/)[0]
  const track = origin ? `\n\nAcompanhe aqui: ${origin}/pedido/${o.publicToken}` : ""
  if (kind === "ready") {
    return o.type === "dine_in"
      ? `Olá, ${first}! Seu pedido #${o.orderNumber} da ${storeName} está pronto e já vai para a sua mesa. Bom apetite! 😋`
      : `Olá, ${first}! Seu pedido #${o.orderNumber} da ${storeName} está pronto! 😋 Pode retirar no balcão, é só falar o número #${o.orderNumber}.`
  }
  if (kind === "out") return `Olá, ${first}! Seu pedido #${o.orderNumber} da ${storeName} saiu para entrega 🛵 Logo chega aí!${track}`
  return `Olá, ${first}! Aqui é da ${storeName}, sobre o seu pedido #${o.orderNumber}.${track}`
}

const storageKey = (id: string, kind: Kind) => `aviso-wa:${id}:${kind}`

/**
 * Botão "Avisar no WhatsApp": abre o WhatsApp (app no celular, WhatsApp Web no computador) com a mensagem pronta
 * para o número do cliente. Grátis: não usa a API paga do WhatsApp, quem envia é o próprio funcionário.
 * Depois de tocar, mostra "Avisado" (lembrado neste aparelho) para ninguém avisar duas vezes sem querer.
 */
export function NotifyWhatsApp({ order, storeName }: { order: OrderWithItemsView; storeName: string }) {
  const kind = notifyKind(order)
  const [sent, setSent] = useState(false)
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
    try {
      setSent(localStorage.getItem(storageKey(order.id, kind)) === "1")
    } catch {}
  }, [order.id, kind])

  const href = whatsappLink(order.customerPhone, notifyMessage(order, storeName, kind, origin))
  if (!href) return null

  const markSent = () => {
    setSent(true)
    try {
      localStorage.setItem(storageKey(order.id, kind), "1")
    } catch {}
  }

  // Momento de avisar: botão grande e verde. Nas outras etapas, um atalho discreto na linha de baixo.
  if (kind === "chat") {
    return (
      <Button asChild variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Falar com ${order.customerName} no WhatsApp`} title="Falar no WhatsApp">
          <WhatsappIcon className="h-4 w-4" />
        </a>
      </Button>
    )
  }

  const label = kind === "ready" ? (order.type === "dine_in" ? "Avisar que está pronto" : "Avisar que pode retirar") : "Avisar que saiu para entrega"
  return (
    <Button
      asChild
      variant="outline"
      className={cn(
        "h-11 w-full rounded-xl font-semibold",
        sent
          ? "border-green-300 text-green-800 dark:border-green-800 dark:text-green-300"
          : "border-[#25D366] bg-[#25D366]/10 text-[#0b6b34] hover:bg-[#25D366]/20 dark:text-[#5ee08f]",
      )}
    >
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={markSent}>
        {sent ? <Check className="h-5 w-5" aria-hidden /> : <WhatsappIcon className="h-5 w-5" />}
        {sent ? "Avisado no WhatsApp · enviar de novo" : label}
      </a>
    </Button>
  )
}
