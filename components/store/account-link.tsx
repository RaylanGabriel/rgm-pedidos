import Link from "next/link"
import { UserRound } from "lucide-react"
import { getCustomer } from "@/lib/auth/customer"

/**
 * "Entrar" / "Olá, Ana" no topo da loja → página da conta (/conta). Só lê o cookie: sem cookie, nenhuma consulta.
 * overlay: versão para ficar sobre a capa (fundo branco translúcido).
 */
export async function AccountLink({ base, overlay = false }: { base: string; overlay?: boolean }) {
  const me = await getCustomer()
  const first = me?.name?.split(" ")[0]
  return (
    <Link
      href={`${base}/conta`}
      className={`inline-flex h-9 max-w-40 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        overlay ? "bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background" : "border bg-card hover:border-primary hover:text-primary"
      }`}
    >
      <UserRound className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{me ? first || "Minha conta" : "Entrar"}</span>
    </Link>
  )
}
