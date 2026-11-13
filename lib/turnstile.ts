import "server-only"

import { clientIp } from "@/lib/rate-limit-server"

/**
 * Turnstile (CAPTCHA da Cloudflare, quase sempre invisível) no checkout e no login.
 * - TURNSTILE_SITE_KEY (var pública) + TURNSTILE_SECRET_KEY (segredo do Worker). Sem os dois: desligado.
 * - Preview usa as chaves de teste oficiais (sempre passam).
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export const turnstileSiteKey = () => (process.env.TURNSTILE_SITE_KEY ?? "").trim() || null

export const TURNSTILE_ERROR = "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo."

/**
 * true = pode seguir. Recusa só quando a Cloudflare diz que o token é inválido (robô, vencido, repetido).
 * Se a verificação em si falhar (rede, Cloudflare fora), deixa passar: o site não pode parar de vender por isso —
 * os limites por IP continuam valendo.
 */
export async function verifyTurnstile(token: unknown, action: "pedido" | "login") {
  const secret = (process.env.TURNSTILE_SECRET_KEY ?? "").trim()
  if (!secret || !turnstileSiteKey()) return true
  if (typeof token !== "string" || !token || token.length > 2048) return false

  try {
    const body = new FormData()
    body.set("secret", secret)
    body.set("response", token)
    const ip = await clientIp()
    if (ip !== "unknown") body.set("remoteip", ip)
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    })
    const out = (await res.json()) as { success?: boolean; action?: string; "error-codes"?: string[] }
    if (!out.success) {
      console.warn(`turnstile: ${action} recusado`, out["error-codes"]?.join(",") ?? "")
      return false
    }
    // O widget manda a ação em que foi renderizado: token do login não serve para pedido e vice-versa
    if (out.action && out.action !== action) {
      console.warn(`turnstile: ação trocada (${out.action} ≠ ${action})`)
      return false
    }
    return true
  } catch (err) {
    console.error("turnstile: verificação indisponível, seguindo sem ela:", err instanceof Error ? err.message : err)
    return true
  }
}
