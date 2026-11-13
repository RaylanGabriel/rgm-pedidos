import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { cookieDomain } from "@/lib/auth/customer"
import { GOOGLE_COOKIE, googleConfigured, safeReturn, startGoogle } from "@/lib/auth/google"

/** Início do "Entrar com Google": guarda state/PKCE/volta num cookie de 10 min e manda para o Google. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const back = safeReturn(request.nextUrl.searchParams.get("volta"), origin)
  if (!googleConfigured()) return NextResponse.redirect(back)
  const { url, state, verifier } = startGoogle(origin)
  ;(await cookies()).set(GOOGLE_COOKIE, JSON.stringify({ state, verifier, back }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // volta do Google é uma navegação GET: o cookie vai junto
    path: "/auth/cliente",
    domain: await cookieDomain(),
    maxAge: 600,
  })
  return NextResponse.redirect(url)
}
