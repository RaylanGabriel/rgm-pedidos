import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReportsView } from "@/components/reports-view"
import { requireStore } from "@/lib/auth/session"
import { addDaysYmd, isYmd, startOfDaySP, ymdSP } from "@/lib/dates"
import { listOrders } from "@/lib/orders"

export const metadata = { title: "Relatórios" }

type SP = Promise<{ de?: string; ate?: string }>

export default async function RelatoriosPage({ searchParams }: { searchParams: SP }) {
  const { store } = await requireStore()
  const sp = await searchParams

  // Padrão: últimos 7 dias, incluindo hoje
  const today = ymdSP()
  let de = isYmd(sp.de) ? sp.de : addDaysYmd(today, -6)
  let ate = isYmd(sp.ate) ? sp.ate : today
  if (de > ate) [de, ate] = [ate, de]

  const orders = await listOrders(store.id, {
    from: startOfDaySP(de),
    to: startOfDaySP(addDaysYmd(ate, 1)),
    limit: 5000,
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Link>
        </Button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Relatórios</h1>
          <p className="text-muted-foreground">Vendas de {store.name}</p>
        </div>

        <ReportsView orders={orders} de={de} ate={ate} truncated={orders.length >= 5000} />
      </div>
    </div>
  )
}
