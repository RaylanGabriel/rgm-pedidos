"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Recarrega os dados da página (Server Components) a cada `seconds`.
 * Pausa quando a aba está em segundo plano e atualiza na hora ao voltar.
 */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      clearInterval(timer)
      timer = setInterval(() => router.refresh(), seconds * 1000)
    }
    const onVisibility = () => {
      if (document.hidden) clearInterval(timer)
      else {
        router.refresh()
        start()
      }
    }
    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router, seconds])

  return null
}
