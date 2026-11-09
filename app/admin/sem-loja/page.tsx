import { Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSession } from "@/lib/auth/session"

export default async function SemLojaPage() {
  const { user } = await requireSession()

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted">
      <Card className="w-full max-w-md border-2 text-center">
        <CardHeader>
          <Store className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
          <CardTitle>Nenhuma loja vinculada</CardTitle>
          <CardDescription>
            A conta {user.email} ainda não tem acesso a nenhuma loja. Peça ao dono da loja para adicionar você.
          </CardDescription>
          <form action="/auth/logout" method="post" className="pt-4">
            <Button type="submit" variant="outline">
              Sair
            </Button>
          </form>
        </CardHeader>
      </Card>
    </div>
  )
}
