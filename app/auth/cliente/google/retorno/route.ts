import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { cookieDomain, createCustomerSession, upsertCustomer } from "@/lib/auth/customer"
import { finishGoogle, GOOGLE_COOKIE, safeReturn } from "@/lib/auth/google"

/** Volta do Google: confere o state, troca o código, entra (cria a conta se for a 1ª vez) e volta para a loja. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const jar = await cookies()
  let saved: { state?: string; verifier?: string; back?: string } = {}
  try {
    saved = JSON.parse(jar.get(GOOGLE_COOKIE)?.value ?? "{}")
  } catch {}
  jar.set(GOOGLE_COOKIE, "", { path: "/auth/cliente", domain: await cookieDomain(), maxAge: 0 })

  const back = safeReturn(saved.back ?? null, origin)
  const fail = (motivo: string) => {
    const u = new URL(back)
    u.searchParams.set("entrar", motivo)
    return NextResponse.redirect(u)
  }
  const params = request.nextUrl.searchParams
  if (params.get("error")) return fail("cancelado") // o cliente desistiu na tela do Google
  const code = params.get("code")
  if (!code || !saved.state || !saved.verifier || params.get("state") !== saved.state) return fail("erro")

  const profile = await finishGoogle(code, saved.verifier, origin)
  if (!profile) return fail("erro")
  await createCustomerSession(await upsertCustomer(profile.email, { googleSub: profile.sub, name: profile.name }))
  return NextResponse.redirect(back)
}
