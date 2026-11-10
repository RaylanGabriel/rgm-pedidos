"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { confirmDeliveryAction } from "./actions"

/** "Recebi meu pedido": o cliente avisa a loja que a entrega chegou (sem esperar o motoboy). */
export function ConfirmDelivery({ token }: { token: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="h-12 w-full rounded-full bg-green-700 text-base font-bold text-white hover:bg-green-800"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await confirmDeliveryAction(token)
            if (res.error) setError(res.error)
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}
        Recebi meu pedido
      </Button>
      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
