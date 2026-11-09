import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NewOrderForm } from "@/components/new-order-form"
import { requireStore } from "@/lib/auth/session"
import { getMenu } from "@/lib/orders"

export const metadata = { title: "Novo pedido" }

export default async function NovoPedidoPage() {
  const { store } = await requireStore()
  const menu = await getMenu(store.id)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link href="/admin/pedidos">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Link>
        </Button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Novo pedido</h1>
          <p className="text-muted-foreground">Lançar um pedido feito no balcão.</p>
        </div>

        <NewOrderForm menu={menu} />
      </div>
    </div>
  )
}
