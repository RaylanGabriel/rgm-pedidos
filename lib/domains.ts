/**
 * Domínio da plataforma: cada loja em <slug>.rgm.dev.br e o painel em painel.rgm.dev.br.
 * Roda no proxy (edge) e no servidor — sem dependências de Node.
 *
 * Variáveis (só em produção; sem elas tudo funciona pelo caminho /loja/<slug>):
 * - ROOT_DOMAIN  ex.: "rgm.dev.br"
 * - LEGACY_HOST  ex.: "mr-smash-street.vercel.app" (endereço antigo, redireciona para o novo)
 */
export const ROOT_DOMAIN = (process.env.ROOT_DOMAIN ?? "").toLowerCase().trim()
export const LEGACY_HOST = (process.env.LEGACY_HOST ?? "").toLowerCase().trim()
export const PANEL_SUB = "painel"

/** Subdomínios que nenhuma loja pode usar (painel, infraestrutura e outros projetos do domínio). */
export const RESERVED_SUBDOMAINS = new Set([
  PANEL_SUB,
  "www",
  "app",
  "admin",
  "api",
  "mail",
  "email",
  "smtp",
  "ftp",
  "blog",
  "docs",
  "status",
  "static",
  "cdn",
  "assets",
  "dev",
  "staging",
  "preview",
  "teste",
  "test",
  "suporte",
  "ajuda",
  "loja",
  "pedido",
  "pedidos",
  // outros projetos em rgm.dev.br: acrescente aqui
])

export const isReservedSlug = (slug: string) => RESERVED_SUBDOMAINS.has(slug)

/** "MrSmash.rgm.dev.br:443" → "mrsmash.rgm.dev.br" */
export const cleanHost = (host: string | null | undefined) => (host ?? "").toLowerCase().split(":")[0]

/**
 * O que um host significa: loja (slug), painel, domínio raiz, endereço antigo ou outro (preview/localhost).
 */
export function classifyHost(rawHost: string | null | undefined):
  | { kind: "store"; slug: string }
  | { kind: "panel" }
  | { kind: "root" }
  | { kind: "legacy" }
  | { kind: "other" } {
  const host = cleanHost(rawHost)
  if (LEGACY_HOST && host === LEGACY_HOST) return { kind: "legacy" }
  if (!ROOT_DOMAIN) return { kind: "other" }
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return { kind: "root" }
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return { kind: "other" }
  const sub = host.slice(0, -(ROOT_DOMAIN.length + 1))
  if (sub === PANEL_SUB) return { kind: "panel" }
  if (sub.includes(".") || isReservedSlug(sub)) return { kind: "root" }
  return { kind: "store", slug: sub }
}

export const panelOrigin = () => (ROOT_DOMAIN ? `https://${PANEL_SUB}.${ROOT_DOMAIN}` : null)
export const storeOrigin = (slug: string) => (ROOT_DOMAIN ? `https://${slug}.${ROOT_DOMAIN}` : null)
