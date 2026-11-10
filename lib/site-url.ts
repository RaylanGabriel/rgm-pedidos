import "server-only"

import { headers } from "next/headers"
import { storeOrigin } from "@/lib/domains"

/** Endereço público do site (variável SITE_URL em produção; senão, o host da requisição). */
export async function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/** Endereço público do cardápio: <slug>.rgm.dev.br quando o domínio está configurado; senão /loja/<slug>. */
export async function storeUrl(slug: string) {
  return storeOrigin(slug) ?? `${await siteUrl()}/loja/${slug}`
}
