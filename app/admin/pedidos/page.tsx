import { AutoRefresh } from "@/components/auto-refresh"
import { KitchenBoard } from "@/components/kitchen-board"
import { requireStore } from "@/lib/auth/session"
import { startOfDaySP } from "@/lib/dates"
import { listOrders } from "@/lib/orders"
import { ACTIVE_STATUSES } from "@/lib/order-shared"

export default async function PedidosPage() {
  const { store } = await requireStore()

  // Em andamento (de qualquer dia) + finalizados hoje
  const [active, finishedToday] = await Promise.all([
    listOrders(store.id, { statuses: ACTIVE_STATUSES }),
    listOrders(store.id, { statuses: ["delivered", "cancelled"], from: startOfDaySP(), limit: 100 }),
  ])

  return (
    <>
      <AutoRefresh seconds={8} />
      <KitchenBoard storeName={store.name} active={active} finished={finishedToday} />
    </>
  )
}
