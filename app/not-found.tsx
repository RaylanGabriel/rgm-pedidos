import Link from "next/link"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Página não encontrada" }

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-3 text-center">
        <SearchX className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-extrabold">Página não encontrada</h1>
        <p className="text-muted-foreground">
          O link pode estar incompleto ou o pedido não existe mais. Confira o endereço ou volte para o cardápio.
        </p>
        <Button asChild className="h-11 rounded-full px-6">
          <Link href="/">Ir para o cardápio</Link>
        </Button>
      </div>
    </main>
  )
}
