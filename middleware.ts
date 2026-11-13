import { NextResponse, type NextRequest } from "next/server"
import { classifyHost, panelOrigin, storeOrigin } from "@/lib/domains"
import { LEGAL_PATHS } from "@/lib/legal"

const SESSION_COOKIE = "sid" // mesmo nome de lib/auth/session.ts

/** Caminhos que valem em qualquer host (não são "da loja"). */
const GLOBAL_PREFIXES = ["/pedido/", "/_next/", "/api/", "/auth/"]

/**
 * 1) Domínios: <slug>.rgm.dev.br mostra a loja; painel.rgm.dev.br é o painel; a raiz leva ao painel.
 * 2) Painel: checagem otimista do cookie (a validação de verdade é em requireSession()/requireStore()).
 *
 * É `middleware.ts` (runtime Edge) e não `proxy.ts` (Node) de propósito: na Cloudflare (OpenNext) o proxy em Node
 * ainda é experimental e sem manutenção oficial. Este arquivo só lê host e cookie, então roda no Edge sem problema.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = classifyHost(request.headers.get("host"))
  const redirect = (url: string) => withHeaders(NextResponse.redirect(url, 308))
  // Termos e privacidade abrem em qualquer endereço (loja, painel, raiz), sem reescrita nem redirecionamento
  if (LEGAL_PATHS.includes(pathname)) return withHeaders(NextResponse.next())

  if (host.kind === "root") {
    // Retorno do "Entrar com Google" do cliente: endereço único (o Google não aceita *.rgm.dev.br)
    if (pathname.startsWith("/auth/cliente/")) return withHeaders(NextResponse.next())
    const panel = panelOrigin()
    if (panel) return redirect(`${panel}/admin`) // por enquanto; depois aqui entra o site pessoal
  }

  if (host.kind === "store") {
    // Painel não roda no domínio da loja (o login fica no domínio do painel)
    if (pathname.startsWith("/admin")) {
      const panel = panelOrigin()
      if (panel) return redirect(`${panel}${pathname}${search}`)
    }
    // Link no formato antigo (/loja/<slug>/...): mesma loja → caminho curto; outra loja → endereço dela
    const legacyPath = pathname.match(/^\/loja\/([a-z0-9-]+)(\/.*)?$/)
    if (legacyPath) {
      const target = legacyPath[1] === host.slug ? `https://${request.headers.get("host")}` : storeOrigin(legacyPath[1])
      if (target) return redirect(`${target}${legacyPath[2] ?? "/"}${search}`)
    }
    const isGlobal = GLOBAL_PREFIXES.some((p) => pathname.startsWith(p))
    if (!isGlobal) {
      const url = request.nextUrl.clone()
      url.pathname = `/loja/${host.slug}${pathname === "/" ? "" : pathname}`
      return withHeaders(NextResponse.rewrite(url))
    }
  }

  if (host.kind === "panel") {
    if (pathname === "/") return redirect(`${panelOrigin()}/admin`)
    // Cardápio aberto pelo painel → endereço da loja
    const m = pathname.match(/^\/loja\/([a-z0-9-]+)(\/.*)?$/)
    const store = m && storeOrigin(m[1])
    if (store) return redirect(`${store}${m[2] ?? "/"}${search}`)
  }

  const isAdmin = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")
  return withHeaders(
    isAdmin && !request.cookies.has(SESSION_COOKIE) ? NextResponse.redirect(new URL("/admin/login", request.url)) : NextResponse.next(),
  )
}

function withHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
