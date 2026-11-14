"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

const AUTO_RETRY_MS = 15_000

/**
 * Erro numa tela do painel (rede caiu, banco demorou). No quadro da cozinha tenta sozinho a cada 15 s: o tablet fica
 * horas sem ninguém olhar, e sem isso os pedidos novos parariam de aparecer até alguém recarregar.
 */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const kitchen = usePathname() === "/admin/pedidos"
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  useEffect(() => {
    if (!kitchen) return
    const id = setInterval(retry, AUTO_RETRY_MS)
    return () => clearInterval(id)
  }, [kitchen, retry])

  return (
    <div role="alert" className="mx-auto mt-16 max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
      <h2 className="text-lg font-bold">Não conseguimos carregar esta tela</h2>
      <p className="text-sm text-muted-foreground">
        {kitchen
          ? "Pode ser a internet ou o servidor. O quadro tenta de novo sozinho a cada 15 segundos."
          : "Pode ser a internet ou o servidor. Tente de novo em alguns segundos."}
      </p>
      <Button onClick={() => retry()} className="gap-2">
        <RefreshCw className="h-4 w-4" aria-hidden />
        Tentar de novo
      </Button>
      {digest && <p className="text-xs text-muted-foreground">Código do erro: {digest}</p>}
    </div>
  )
}
