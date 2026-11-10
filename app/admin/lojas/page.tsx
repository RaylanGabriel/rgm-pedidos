import Link from "next/link"
import { sql } from "drizzle-orm"
import { ArrowLeft, ExternalLink, LogIn, Power, Store } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/admin/form-ui"
import { db } from "@/db"
import { requireSuperadmin } from "@/lib/auth/session"
import { siteUrl } from "@/lib/site-url"
import { enterStoreAction, reactivateStoreAction } from "./actions"
import { NewStoreForm, ResetPasswordForm, SuspendForm } from "./forms"

export const metadata = { title: "Lojas" }

type Member = { id: string; name: string; email: string; role: "owner" | "staff"; mustChangePassword: boolean }
type StoreRow = {
  id: string
  name: string
  slug: string
  active: boolean
  is_open: boolean
  created_at: string
  suspended_reason: string | null
  suspended_at: string | null
  members: Member[]
  orders_30d: number
  items: number
}

export default async function LojasPage() {
  const session = await requireSuperadmin()
  const base = await siteUrl()

  const { rows } = await db.execute<StoreRow>(sql`
    SELECT s.id, s.name, s.slug, s.active, s.is_open, s.created_at, s.suspended_reason, s.suspended_at,
      COALESCE(
        (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', m.role,
                                           'mustChangePassword', u.must_change_password) ORDER BY m.role, u.name)
           FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.store_id = s.id),
        '[]'::json) AS members,
      (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id AND o.created_at > now() - interval '30 days') AS orders_30d,
      (SELECT count(*)::int FROM menu_items i WHERE i.store_id = s.id AND i.active) AS items
    FROM stores s
    ORDER BY s.created_at
  `)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao painel
          </Link>
        </Button>

        <div>
          <h1 className="text-4xl font-bold">Lojas</h1>
          <p className="text-muted-foreground">Área da plataforma · só você vê esta tela.</p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle>Nova loja</CardTitle>
            <CardDescription>Cria a loja e a conta do dono. O dono recebe uma senha provisória e escolhe a dele no primeiro acesso.</CardDescription>
          </CardHeader>
          <CardContent>
            <NewStoreForm siteUrl={base} />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">Todas as lojas ({rows.length})</h2>
          {rows.map((s) => {
            const current = s.id === session.activeStoreId
            return (
              <Card key={s.id} className={current ? "border-primary border-2" : ""}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-lg flex flex-wrap items-center gap-2">
                        <Store className="w-4 h-4 text-muted-foreground" aria-hidden />
                        {s.name}
                        {current && <Badge>Você está aqui</Badge>}
                        {!s.active ? (
                          <Badge variant="destructive">Suspensa</Badge>
                        ) : (
                          <Badge variant="secondary">{s.is_open ? "Aberta" : "Fechada"}</Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        /loja/{s.slug} · {s.items} {s.items === 1 ? "item" : "itens"} no cardápio · {s.orders_30d} pedidos em 30 dias · desde{" "}
                        {new Date(s.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </p>
                      {!s.active && (
                        <p className="text-sm text-destructive mt-1">
                          Suspensa{s.suspended_at && ` em ${new Date(s.suspended_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
                          {s.suspended_reason && <>: “{s.suspended_reason}”</>}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <ActionButton action={enterStoreAction.bind(null, s.id)} size="sm" disabled={current}>
                        <LogIn className="w-4 h-4" />
                        Entrar
                      </ActionButton>
                      {s.active && (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/loja/${s.slug}`} target="_blank">
                            <ExternalLink className="w-4 h-4" />
                            Cardápio
                          </Link>
                        </Button>
                      )}
                      {s.active ? (
                        <SuspendForm storeId={s.id} storeName={s.name} />
                      ) : (
                        <ActionButton action={reactivateStoreAction.bind(null, s.id)} size="sm" confirmText={`Reativar "${s.name}"? O cardápio volta ao ar.`}>
                          <Power className="w-4 h-4" />
                          Reativar
                        </ActionButton>
                      )}
                    </div>
                  </div>

                  {s.members.length > 0 ? (
                    <ul className="text-sm divide-y border rounded-md">
                      {s.members.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                          <span className="min-w-0">
                            <span className="font-medium">{m.name}</span>{" "}
                            <span className="text-muted-foreground break-all">{m.email}</span>{" "}
                            <Badge variant="outline" className="ml-1">
                              {m.role === "owner" ? "Dono" : "Funcionário"}
                            </Badge>
                            {m.mustChangePassword && <span className="text-xs text-amber-700 dark:text-amber-400 ml-2">ainda não trocou a senha</span>}
                          </span>
                          {m.id !== session.user.id && <ResetPasswordForm userId={m.id} label={m.email} />}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-amber-700 dark:text-amber-400">Sem dono vinculado.</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </section>
      </div>
    </div>
  )
}
