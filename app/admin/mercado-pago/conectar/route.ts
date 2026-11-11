import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { requireOwner } from "@/lib/auth/session"
import { authorizationUrl, mpConfigured } from "@/lib/mercadopago"

const STATE_COOKIE = "mp_oauth" // mesmo nome em retorno/route.ts

/** "Conectar Mercado Pago": guarda um state aleatório (anti-CSRF) e manda o dono para autorizar. */
export async function GET(req: Request) {
  const { store } = await requireOwner()
  if (!mpConfigured()) return NextResponse.redirect(new URL("/admin/pagamentos?erro=config", req.url))

  // O Mercado Pago volta para o endereço cadastrado (MP_REDIRECT_URI): a conexão tem que começar nele,
  // senão o cookie de segurança fica em outro domínio
  const registered = new URL(process.env.MP_REDIRECT_URI!).origin
  const here = new URL(req.url)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? here.host
  if (`https://${host}` !== registered && !host.startsWith("localhost")) {
    return NextResponse.redirect(`${registered}/admin/mercado-pago/conectar`)
  }

  const state = randomBytes(24).toString("base64url")
  ;(await cookies()).set(STATE_COOKIE, `${state}.${store.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // precisa voltar no redirecionamento vindo do Mercado Pago
    path: "/admin/mercado-pago",
    maxAge: 10 * 60, // o código do Mercado Pago vale 10 minutos
  })
  return NextResponse.redirect(authorizationUrl(state))
}
