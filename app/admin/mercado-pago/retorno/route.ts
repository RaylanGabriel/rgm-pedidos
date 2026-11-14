import { timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { requireOwner } from "@/lib/auth/session"
import { connectWithCode } from "@/lib/mercadopago"

const STATE_COOKIE = "mp_oauth"

/** Volta do Mercado Pago com ?code&state: confere o state, troca o código pelos tokens e salva. */
export async function GET(req: Request) {
  const { store, user } = await requireOwner()
  const url = new URL(req.url)
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/pagamentos?${q}`, req.url))

  const jar = await cookies()
  const saved = jar.get(STATE_COOKIE)?.value ?? ""
  jar.delete({ name: STATE_COOKIE, path: "/admin/mercado-pago" })

  if (url.searchParams.get("error")) return back("erro=negado") // dono clicou em "cancelar"
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state") ?? ""
  const [savedState, savedStore] = saved.split(".")
  // Compara o tamanho em BYTES (não em letras): um state com acento teria bytes diferentes e o timingSafeEqual daria erro 500
  const a = Buffer.from(savedState)
  const b = Buffer.from(state)
  const same = !!savedState && a.length === b.length && timingSafeEqual(a, b)
  if (!code || !same || savedStore !== store.id) return back("erro=expirou")

  try {
    await connectWithCode(store.id, user.id, code)
  } catch (err) {
    console.error("Mercado Pago: falha ao conectar a loja", store.id, err instanceof Error ? err.message : err)
    return back("erro=falhou")
  }
  return back("ok=conectado")
}
