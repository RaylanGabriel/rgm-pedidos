import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardList, Plus, BarChart3, Flame, LogOut } from "lucide-react"
import Image from "next/image"
import { requireStore } from "@/lib/auth/session"
import { Button } from "@/components/ui/button"

export default async function AdminPage() {
  const { store, user } = await requireStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center mb-12 pt-8">
          {store.logoUrl && (
            <div className="relative w-48 h-48 mb-6">
              <Image src={store.logoUrl} alt={`Logo ${store.name}`} fill className="object-contain" priority />
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-bold text-center mb-2 text-foreground">{store.name}</h1>
          <p className="text-xl text-muted-foreground text-center">Painel Administrativo · Olá, {user.name}</p>
        </div>

        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Flame className="w-6 h-6 text-primary" />
            Área Administrativa
          </h2>
          <form action="/auth/logout" method="post">
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Link href="/admin/pedidos/novo" className="group">
            <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-primary">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                  <Plus className="w-6 h-6 text-primary-foreground" />
                </div>
                <CardTitle className="text-2xl">Novo Pedido</CardTitle>
                <CardDescription>Criar um novo pedido para clientes</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Adicione lanches, ingredientes extras e calcule o total automaticamente
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/pedidos" className="group">
            <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-accent">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                  <ClipboardList className="w-6 h-6 text-accent-foreground" />
                </div>
                <CardTitle className="text-2xl">Pedidos Ativos</CardTitle>
                <CardDescription>Gerenciar pedidos em andamento</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Visualize status, tempo de espera e atualize pedidos em tempo real
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/relatorios" className="group">
            <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-secondary">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                  <BarChart3 className="w-6 h-6 text-secondary-foreground" />
                </div>
                <CardTitle className="text-2xl">Relatórios</CardTitle>
                <CardDescription>Análise de pedidos e vendas</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Consulte pedidos por data, total de vendas e estatísticas
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="mt-12 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Ver site do cliente →
          </Link>
        </div>
      </div>
    </div>
  )
}
