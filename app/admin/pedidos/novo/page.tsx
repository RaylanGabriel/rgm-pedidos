import { createClient } from "@/lib/supabase/server"
import { NewOrderForm } from "@/components/new-order-form"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireStore } from "@/lib/auth/session"

export default async function NovoPedidoPage() {
  await requireStore()
  const supabase = await createClient() // TODO: migrar consulta para o Neon (filtrando por store.id)

  const [menuItemsResult, ingredientsResult] = await Promise.all([
    supabase.from("menu_items").select("*").eq("active", true).order("name"),
    supabase.from("ingredients").select("*").eq("active", true).order("name"),
  ])

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
          <h1 className="text-4xl font-bold mb-2">Novo Pedido</h1>
          <p className="text-muted-foreground">Crie um novo pedido selecionando lanches e adicionais</p>
        </div>

        <NewOrderForm menuItems={menuItemsResult.data || []} ingredients={ingredientsResult.data || []} />
      </div>
    </div>
  )
}
