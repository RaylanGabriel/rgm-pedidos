import { NextResponse, type NextRequest } from "next/server"
import { classifyHost, panelOrigin, storeOrigin } from "@/lib/domains"

const SESSION_COOKIE = "sid" // mesmo nome de lib/auth/session.ts

/** Caminhos que valem em qualquer host (não são "da loja"). */
const GLOBAL_PREFIXES = ["/pedido/", "/_next/", "/api/", "/auth/"]

/**
 * 1) Domínios: <slug>.rgm.dev.br mostra a loja; painel.rgm.dev.br é o painel; o endereço antigo redireciona.
 * 2) Painel: checagem otimista do cookie (a validação de verdade é em requireSession()/requireStore()).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = classifyHost(request.headers.get("host"))
  const redirect = (url: string) => withHeaders(NextResponse.redirect(url, 308))

  if (host.kind === "legacy") {
    // QR codes e links antigos: /loja/<slug>/... → <slug>.rgm.dev.br/... ; /admin → painel
    const m = pathname.match(/^\/loja\/([a-z0-9-]+)(\/.*)?$/)
    const store = m && storeOrigin(m[1])
    if (store) return redirect(`${store}${m[2] ?? ""}${search}`)
    // raiz antiga abria o cardápio da loja padrão: continua abrindo, no endereço novo
    const home = pathname === "/" && storeOrigin(process.env.DEFAULT_STORE_SLUG || "mr-smash")
    if (home) return redirect(`${home}/`)
    const panel = panelOrigin()
    if (panel && pathname.startsWith("/admin")) return redirect(`${panel}${pathname}${search}`)
    // /pedido/<token> continua funcionando aqui (links de acompanhamento já enviados)
  }

  if (host.kind === "root") {
    const panel = panelOrigin()
    if (panel) return redirect(`${panel}/admin`) // por enquanto; depois aqui entra o site pessoal
  }

  if (host.kind === "store") {
    // Painel não roda no domínio da loja (o login fica no domínio do painel)
    if (pathname.startsWith("/admin")) {
      const panel = panelOrigin()
      if (panel) return redirect(`${panel}${pathname}${search}`)
    }
    const isGlobal = GLOBAL_PREFIXES.some((p) => pathname.startsWith(p)) || pathname.startsWith("/loja/")
    if (!isGlobal) {
      const url = request.nextUrl.clone()
      url.pathname = `/loja/${host.slug}${pathname === "/" ? "" : pathname}`
      return withHeaders(NextResponse.rewrite(url))
    }
  }

  if (host.kind === "panel" && pathname === "/") return redirect(`${panelOrigin()}/admin`)

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
