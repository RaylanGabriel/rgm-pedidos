import "server-only"

import { headers } from "next/headers"
import { classifyHost, storeOrigin } from "@/lib/domains"

/** Endereço público do site (variável SITE_URL em produção; senão, o host da requisição). */
export async function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/**
 * Caminho base da loja nos links internos: "" quando a página abriu no endereço da própria loja
 * (mrsmash.rgm.dev.br/finalizar), "/loja/<slug>" nos outros (endereço antigo, preview, localhost).
 */
export async function storeBase(slug: string) {
  const h = await headers()
  const host = classifyHost(h.get("x-forwarded-host") ?? h.get("host"))
  return host.kind === "store" && host.slug === slug ? "" : `/loja/${slug}`
}

/** Endereço público do cardápio: <slug>.rgm.dev.br quando o domínio está configurado; senão /loja/<slug>. */
export async function storeUrl(slug: string) {
  return storeOrigin(slug) ?? `${await siteUrl()}/loja/${slug}`
}
