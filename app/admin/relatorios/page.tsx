import { createClient } from "@/lib/supabase/server"
import { ReportsView } from "@/components/reports-view"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireStore } from "@/lib/auth/session"

export default async function RelatoriosPage() {
  await requireStore()
  const supabase = await createClient() // TODO: migrar consulta para o Neon (filtrando por store.id)

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      *,
      order_items (
        *,
        menu_items (*),
        order_item_ingredients (
          *,
          ingredients (*)
        )
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Erro ao buscar pedidos:", error)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Relatórios</h1>
          <p className="text-muted-foreground">Análise de pedidos e vendas do restaurante</p>
        </div>

        <ReportsView orders={orders || []} />
      </div>
    </div>
  )
}
