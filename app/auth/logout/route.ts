import { NextResponse, type NextRequest } from "next/server"
import { deleteSession } from "@/lib/auth/session"

// Só POST: um GET permitiria deslogar alguém com um simples link/imagem em outro site.
export async function POST(request: NextRequest) {
  await deleteSession()
  return NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 })
}
