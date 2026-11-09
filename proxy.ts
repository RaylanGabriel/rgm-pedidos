import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE = "sid" // mesmo nome de lib/auth/session.ts

/**
 * Checagem otimista: só olha se o cookie existe, sem ir ao banco.
 * A validação de verdade acontece em requireSession()/requireStore() em cada página do painel.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAdmin = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")

  const response =
    isAdmin && !request.cookies.has(SESSION_COOKIE)
      ? NextResponse.redirect(new URL("/admin/login", request.url))
      : NextResponse.next()

  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
