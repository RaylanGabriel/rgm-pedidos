"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Erro numa página pública (cardápio, finalizar, acompanhamento): mensagem simples, sem detalhes técnicos. */
export default function PublicError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined
  return (
    <main role="alert" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold">Ops, algo deu errado</h1>
      <p className="text-sm text-muted-foreground">Pode ser a internet ou o nosso servidor. Tente de novo em alguns segundos.</p>
      <Button onClick={() => retry()} className="gap-2 rounded-full">
        <RefreshCw className="h-4 w-4" aria-hidden />
        Tentar de novo
      </Button>
      {digest && <p className="text-xs text-muted-foreground">Código do erro: {digest}</p>}
    </main>
  )
}
