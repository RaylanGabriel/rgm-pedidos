import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, ClipboardList, Plus, BarChart3, Bike, Building2, Flame, LogOut, ExternalLink, UtensilsCrossed, Settings, UserCog, Users, Wallet } from "lucide-react"
import { toggleStoreOpenAction } from "./actions"
import Image from "next/image"
import { requireStore } from "@/lib/auth/session"
import { storeUrl } from "@/lib/site-url"
import { storeOpenState, whenLabel } from "@/lib/hours"
import { Button } from "@/components/ui/button"

export default async function AdminPage() {
  const { store, user, role, isSupport } = await requireStore()
  const canManage = role === "owner" || user.isSuperadmin
  const menuUrl = await storeUrl(store.slug)
  const now = new Date()
  const openState = storeOpenState(store, now)
  const isOpen = openState.open
  const when = openState.changeAt ? whenLabel(openState.changeAt, now) : null
  const statusText = openState.manual
    ? `${isOpen ? "Aberta" : "Fechada"} por você até ${when}; depois volta ao horário automático.`
    : openState.auto
      ? `Horário automático · ${isOpen ? "fecha" : "abre"} ${when}.`
      : isOpen
        ? "Recebendo pedidos pelo site."
        : "O site mostra o cardápio, mas não aceita pedidos."
  const toggleLabel = openState.manual ? "Voltar ao horário" : store.hoursEnabled ? (isOpen ? "Fechar agora" : "Abrir agora") : isOpen ? "Fechar loja" : "Abrir loja"

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {(isSupport || !store.active) && (
        <div role="status" className="bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100 text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>
            {isSupport ? <>Modo suporte: você está no painel de <strong>{store.name}</strong>.</> : null}
            {!store.active && (
              <>
                {" "}Loja <strong>suspensa</strong>
                {store.suspendedReason && <> (“{store.suspendedReason}”)</>}: fora do ar para clientes e equipe.
              </>
            )}
          </span>
          <Link href="/admin/lojas" className="font-semibold underline underline-offset-2">
            Voltar para Lojas
          </Link>
        </div>
      )}
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

        {/* Mesma largura do status e dos cartões abaixo (max-w-6xl centralizado); no celular os botões descem */}
        <div className="max-w-6xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Flame className="w-6 h-6 text-primary" />
            Área Administrativa
          </h2>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/conta">
                <UserCog className="w-4 h-4 mr-2" />
                Minha conta
              </Link>
            </Button>
            <form action="/auth/logout" method="post">
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </form>
          </div>
        </div>

        <Card className="max-w-6xl mx-auto mb-6 border-2">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full shrink-0 ${isOpen ? "bg-green-500" : "bg-muted-foreground"}`}
                aria-hidden
              />
              <div>
                <p className="font-semibold">{isOpen ? "Loja aberta" : "Loja fechada"}</p>
                <p className="text-sm text-muted-foreground">{statusText}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={menuUrl} target="_blank">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ver cardápio
                </Link>
              </Button>
              {canManage && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/horarios">
                    <Clock className="w-4 h-4 mr-2" />
                    Horários
                  </Link>
                </Button>
              )}
              <form action={toggleStoreOpenAction}>
                <Button type="submit" size="sm" variant={isOpen || openState.manual ? "outline" : "default"}>
                  {toggleLabel}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

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
                <CardTitle className="text-2xl">Cozinha</CardTitle>
                <CardDescription>Pedidos novos, em preparo e prontos</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Quadro com tempo de espera, alerta de atraso, som de pedido novo e tela cheia para tablet
                </p>
              </CardContent>
            </Card>
          </Link>

          {canManage && (
            <Link href="/admin/relatorios" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-secondary">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                    <BarChart3 className="w-6 h-6 text-secondary-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Relatórios</CardTitle>
                  <CardDescription>Faturamento, mais vendidos e horário de pico</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Compare com o período anterior, confira o caixa por forma de pagamento e baixe em planilha
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}

          <Link href="/admin/cardapio" className="group">
            <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-primary">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                  <UtensilsCrossed className="w-6 h-6 text-primary-foreground" />
                </div>
                <CardTitle className="text-2xl">Cardápio</CardTitle>
                <CardDescription>{canManage ? "Lanches, preços e adicionais" : "Marcar lanches esgotados"}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {canManage ? "Crie, edite, reordene e marque itens como esgotados" : "Avise os clientes quando um lanche acabar"}
                </p>
              </CardContent>
            </Card>
          </Link>

          {canManage && (
            <Link href="/admin/configuracoes" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-accent">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                    <Settings className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Configurações</CardTitle>
                  <CardDescription>Nome, logo, cor e QR code</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Personalize a loja e baixe o QR code do cardápio</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {canManage && (
            <Link href="/admin/entrega" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-primary">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                    <Bike className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Entrega</CardTitle>
                  <CardDescription>
                    {!store.deliveryEnabled ? "Desligada" : store.deliveryPricing === "zones" ? "Taxa por bairro" : "Taxa fixa"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Bairros atendidos, taxa de entrega e pedido mínimo</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {canManage && (
            <Link href="/admin/pagamentos" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-accent">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                    <Wallet className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Pagamentos</CardTitle>
                  <CardDescription>Pix pelo Mercado Pago</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Conecte sua conta: o cliente paga o Pix pelo site e o pedido só entra na cozinha depois de pago</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {canManage && (
            <Link href="/admin/equipe" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-primary">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                    <Users className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Equipe</CardTitle>
                  <CardDescription>Login dos funcionários</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Cada funcionário com o próprio acesso à cozinha e ao balcão, sem ver faturamento nem pagamentos</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {user.isSuperadmin && (
            <Link href="/admin/lojas" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 border-dashed hover:border-primary">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                    <Building2 className="w-6 h-6 text-secondary-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Lojas</CardTitle>
                  <CardDescription>Plataforma · só você vê</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Crie lojas para clientes, entre no painel delas e suspenda ou reative</p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        <div className="mt-12 text-center">
          <Link href={menuUrl} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Ver site do cliente →
          </Link>
        </div>
      </div>
    </div>
  )
}
