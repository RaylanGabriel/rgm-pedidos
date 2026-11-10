import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReportsView } from "@/components/reports-view"
import { requireOwner } from "@/lib/auth/session"
import { addDaysYmd, startOfDaySP } from "@/lib/dates"
import { listOrders } from "@/lib/orders"
import { resolveRange } from "@/lib/report-range"
import { getReport } from "@/lib/reports"

export const metadata = { title: "Relatórios" }

const PAGE_SIZE = 30

type SP = Promise<{ de?: string; ate?: string; pagina?: string }>

export default async function RelatoriosPage({ searchParams }: { searchParams: SP }) {
  // Faturamento é informação do dono: a equipe (staff) não vê
  const { store } = await requireOwner()
  const sp = await searchParams
  const { de, ate, clamped } = resolveRange(sp.de, sp.ate)
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.pagina ?? "1", 10) || 1))

  const [report, orders] = await Promise.all([
    getReport(store.id, de, ate),
    listOrders(store.id, {
      from: startOfDaySP(de),
      to: startOfDaySP(addDaysYmd(ate, 1)),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Link>
        </Button>

        <ReportsView
          storeName={store.name}
          promisedMinutes={store.avgPrepMinutes}
          report={report}
          orders={orders}
          de={de}
          ate={ate}
          clamped={clamped}
          page={page}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  )
}
