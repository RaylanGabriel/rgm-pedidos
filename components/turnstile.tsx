"use client"

import { useEffect, useRef } from "react"

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string
  remove(id: string): void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
    __turnstileLoading?: Promise<void>
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

function loadScript() {
  if (window.turnstile) return Promise.resolve()
  window.__turnstileLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script")
    s.src = SCRIPT
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      window.__turnstileLoading = undefined
      reject(new Error("turnstile: script não carregou"))
    }
    document.head.appendChild(s)
  })
  return window.__turnstileLoading
}

/**
 * Widget do Turnstile. Fica invisível e só aparece se a Cloudflare precisar de uma interação.
 * Dentro de um <form>, também grava o token num campo oculto `cf-turnstile-response`.
 * O token vale para UM envio: depois de cada tentativa, troque a `key` do componente para gerar outro.
 */
export function Turnstile({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string
  action: "pedido" | "login"
  onToken?: (token: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    let id: string | undefined
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          language: "pt-br",
          callback: (token: string) => onTokenRef.current?.(token),
          "expired-callback": () => onTokenRef.current?.(null),
          "error-callback": () => onTokenRef.current?.(null),
        })
      })
      .catch(() => onTokenRef.current?.(null))
    return () => {
      cancelled = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey, action])

  return <div ref={ref} className="flex justify-center empty:hidden" />
}
