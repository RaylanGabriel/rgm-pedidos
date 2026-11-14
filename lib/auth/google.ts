import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { cleanHost, ROOT_DOMAIN } from "@/lib/domains"
import { hasUnsafeUrlChars, localPath } from "@/lib/links"

/*
 * "Entrar com Google" do cliente (OAuth 2.0 / OpenID Connect com PKCE), sem biblioteca.
 * O Google só aceita endereços de retorno exatos (nada de *.rgm.dev.br), então o retorno é um só:
 * https://rgm.dev.br/auth/cliente/google/retorno. De lá o cliente volta para a loja de onde saiu.
 * Variáveis: GOOGLE_CLIENT_ID (pública) e GOOGLE_CLIENT_SECRET (segredo do Worker).
 */

export const GOOGLE_COOKIE = "g_oauth"
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

/** Endereço base do login: o domínio raiz em produção; no preview, o próprio host. */
export const authOrigin = (requestOrigin: string) => (ROOT_DOMAIN ? `https://${ROOT_DOMAIN}` : requestOrigin)
export const redirectUri = (requestOrigin: string) => `${authOrigin(requestOrigin)}/auth/cliente/google/retorno`

/**
 * Para onde voltar depois de entrar: só caminho deste site ou uma loja da plataforma (https://<x>.rgm.dev.br).
 * Qualquer outra coisa vira "/" (impede usar o login para mandar o cliente a um site falso).
 */
export function safeReturn(raw: string | null, requestOrigin: string) {
  if (!raw || hasUnsafeUrlChars(raw)) return "/"
  if (raw.startsWith("/")) {
    const path = localPath(raw)
    return path ? new URL(path, requestOrigin).toString() : "/"
  }
  try {
    const u = new URL(raw)
    const host = cleanHost(u.host)
    const ours = ROOT_DOMAIN ? host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`) : u.origin === requestOrigin
    return u.protocol === "https:" && ours ? u.toString() : "/"
  } catch {
    return "/"
  }
}

export function startGoogle(requestOrigin: string) {
  const state = randomBytes(16).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(requestOrigin),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString()
  return { url: url.toString(), state, verifier }
}

type GoogleProfile = { sub: string; email: string; name: string | null }

/**
 * Troca o código pelo id_token. Ele vem direto do Google por HTTPS (sem passar pelo navegador), então basta
 * conferir os campos (OpenID Connect, 3.1.3.7): emissor, destinatário, validade e e-mail verificado.
 */
export async function finishGoogle(code: string, verifier: string, requestOrigin: string): Promise<GoogleProfile | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(requestOrigin),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    console.error("google: troca do código falhou", res.status)
    return null
  }
  const { id_token } = (await res.json()) as { id_token?: string }
  const payload = id_token?.split(".")[1]
  if (!payload) return null
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>
  const okIssuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com"
  const okAudience = claims.aud === process.env.GOOGLE_CLIENT_ID
  const okTime = typeof claims.exp === "number" && claims.exp * 1000 > Date.now()
  if (!okIssuer || !okAudience || !okTime || claims.email_verified !== true || typeof claims.email !== "string" || typeof claims.sub !== "string") {
    console.error("google: id_token recusado", { okIssuer, okAudience, okTime, verified: claims.email_verified === true })
    return null
  }
  return { sub: claims.sub, email: claims.email, name: typeof claims.name === "string" ? claims.name : null }
}
