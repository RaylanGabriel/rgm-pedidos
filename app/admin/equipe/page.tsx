import Link from "next/link"
import { eq, sql } from "drizzle-orm"
import { ArrowLeft, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db"
import { sessions, storeMembers, users } from "@/db/schema"
import { requireOwner } from "@/lib/auth/session"
import { AddStaffForm, StaffActions } from "./forms"

export const metadata = { title: "Equipe" }

const dateTime = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ removido?: string }> }) {
  const { store, user } = await requireOwner()
  const removed = (await searchParams).removido?.slice(0, 100)

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: storeMembers.role,
      mustChangePassword: users.mustChangePassword,
      // Último login (sessão mais recente). Sessões apagadas ao sair não contam: é uma indicação, não um registro.
      lastLogin: sql<Date | null>`(SELECT max(${sessions.createdAt}) FROM ${sessions} WHERE ${sessions.userId} = ${users.id})`.mapWith(
        (v) => (v ? new Date(v) : null),
      ),
    })
    .from(storeMembers)
    .innerJoin(users, eq(users.id, storeMembers.userId))
    .where(eq(storeMembers.storeId, store.id))
    .orderBy(storeMembers.role, users.name) // donos primeiro (ordem do enum), depois por nome

  const staffCount = members.filter((m) => m.role === "staff").length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao painel
          </Link>
        </Button>

        <div>
          <h1 className="text-4xl font-bold flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" aria-hidden />
            Equipe
          </h1>
          <p className="text-muted-foreground mt-1">
            Cada funcionário entra com o próprio login. Assim o seu fica só com você: faturamento, preços e pagamentos.
          </p>
        </div>

        {removed && (
          <p role="status" className="rounded-lg border border-green-600/40 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 px-4 py-3 text-sm">
            {removed} não tem mais acesso a esta loja.
          </p>
        )}

        <Card className="border-2">
          <CardHeader>
            <CardTitle>Adicionar funcionário</CardTitle>
            <CardDescription>
              A pessoa recebe uma senha provisória e escolhe a própria no primeiro acesso. Funcionário usa a cozinha, lança pedidos no
              balcão (com Pix), marca lanches esgotados e abre/fecha a loja. Não vê relatórios, configurações nem pagamentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddStaffForm />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">
            Quem tem acesso ({members.length}){staffCount === 0 && <span className="text-base font-normal text-muted-foreground"> · nenhum funcionário ainda</span>}
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {members.map((m) => (
                  <li key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium flex flex-wrap items-center gap-2">
                        {m.name}
                        <Badge variant={m.role === "owner" ? "default" : "outline"}>{m.role === "owner" ? "Dono" : "Funcionário"}</Badge>
                        {m.id === user.id && <span className="text-xs text-muted-foreground">(você)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground break-all">{m.email}</p>
                      <p className="text-xs mt-0.5">
                        {m.mustChangePassword ? (
                          <span className="text-amber-700 dark:text-amber-400">Ainda não entrou (senha provisória)</span>
                        ) : (
                          <span className="text-muted-foreground">{m.lastLogin ? `Último login: ${dateTime(m.lastLogin)}` : "Já entrou"}</span>
                        )}
                      </p>
                    </div>
                    {m.role === "staff" && m.id !== user.id && <StaffActions userId={m.id} name={m.name} />}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Esqueceu a senha? Use “Nova senha” e passe a provisória para a pessoa. Saiu da loja? “Remover” tira o acesso na hora.
          </p>
        </section>
      </div>
    </div>
  )
}
