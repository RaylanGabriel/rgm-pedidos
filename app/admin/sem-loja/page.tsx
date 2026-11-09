import Link from "next/link"
import { Ban, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSession } from "@/lib/auth/session"

export default async function SemLojaPage({ searchParams }: { searchParams: Promise<{ suspensa?: string }> }) {
  const { user } = await requireSession()
  const suspended = (await searchParams).suspensa === "1"
  const Icon = suspended ? Ban : Store

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted">
      <Card className="w-full max-w-md border-2 text-center">
        <CardHeader>
          <Icon className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
          <CardTitle>{suspended ? "Loja suspensa" : "Nenhuma loja vinculada"}</CardTitle>
          <CardDescription>
            {suspended
              ? "O acesso a esta loja está suspenso no momento. Fale com o suporte da plataforma para reativar."
              : `A conta ${user.email} ainda não tem acesso a nenhuma loja. Peça ao dono da loja para adicionar você.`}
          </CardDescription>
          <div className="pt-4 flex justify-center gap-2">
            {user.isSuperadmin && (
              <Button asChild>
                <Link href="/admin/lojas">Ir para Lojas</Link>
              </Button>
            )}
            <form action="/auth/logout" method="post">
              <Button type="submit" variant="outline">
                Sair
              </Button>
            </form>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
