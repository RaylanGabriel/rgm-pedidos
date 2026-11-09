import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AutoRefresh } from "@/components/auto-refresh"
import { OrdersList } from "@/components/orders-list"
import { requireStore } from "@/lib/auth/session"
import { startOfDaySP } from "@/lib/dates"
import { listOrders } from "@/lib/orders"

export const metadata = { title: "Pedidos" }

export default async function PedidosPage() {
  const { store } = await requireStore()

  // Em andamento (de qualquer dia) + finalizados hoje
  const [active, finishedToday] = await Promise.all([
    listOrders(store.id, { statuses: ["pending", "preparing", "ready"] }),
    listOrders(store.id, { statuses: ["delivered", "cancelled"], from: startOfDaySP(), limit: 100 }),
  ])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <AutoRefresh seconds={8} />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/pedidos/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo pedido
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Pedidos</h1>
          <p className="text-muted-foreground">Atualiza sozinho a cada poucos segundos.</p>
        </div>

        <OrdersList storeName={store.name} active={active} finished={finishedToday} />
      </div>
    </div>
  )
}
