import Link from "next/link"
import { and, eq } from "drizzle-orm"
import { Ban, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db"
import { storeMembers, stores } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"

export default async function SemLojaPage() {
  const session = await requireSession()
  const { user } = session

  // Loja ativa da sessão suspensa? (só mostra o motivo para quem é membro dela)
  const [suspended] = session.activeStoreId
    ? await db
        .select({ name: stores.name, reason: stores.suspendedReason, at: stores.suspendedAt })
        .from(stores)
        .innerJoin(storeMembers, and(eq(storeMembers.storeId, stores.id), eq(storeMembers.userId, user.id)))
        .where(and(eq(stores.id, session.activeStoreId), eq(stores.active, false)))
        .limit(1)
    : []
  const Icon = suspended ? Ban : Store

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted">
      <Card className="w-full max-w-md border-2 text-center">
        <CardHeader>
          <Icon className={`w-10 h-10 mx-auto mb-2 ${suspended ? "text-destructive" : "text-muted-foreground"}`} />
          <CardTitle>{suspended ? `${suspended.name} está suspensa` : "Nenhuma loja vinculada"}</CardTitle>
          {suspended ? (
            <div className="space-y-3 pt-1">
              {suspended.reason && (
                <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 px-4 py-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Motivo</p>
                  <p className="mt-1 whitespace-pre-line">{suspended.reason}</p>
                </div>
              )}
              <CardDescription>
                {suspended.at && `Desde ${suspended.at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. `}
                Enquanto isso, o cardápio fica fora do ar e não recebe pedidos. Fale com o suporte da plataforma para reativar.
              </CardDescription>
            </div>
          ) : (
            <CardDescription>A conta {user.email} ainda não tem acesso a nenhuma loja. Peça ao dono da loja para adicionar você.</CardDescription>
          )}
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
