import { notFound } from "next/navigation"
import { brandStyle } from "@/lib/color"
import { getDeliveryConfig, getMenu, getStoreBySlug, publicStore } from "@/lib/orders"
import { StoreFooter, StoreHeader } from "@/components/store/store-header"
import { CheckoutForm } from "./checkout-form"

export const metadata = { title: "Finalizar pedido" }

export default async function FinalizarPage({ params }: { params: Promise<{ slug: string }> }) {
  const store = await getStoreBySlug((await params).slug)
  if (!store) notFound()
  const [menu, delivery] = await Promise.all([getMenu(store.id), getDeliveryConfig(store)])
  const pub = publicStore(store)

  return (
    <div style={brandStyle(pub.primaryColor)} className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted">
      <StoreHeader store={pub} />
      <main className="flex-1">
        <CheckoutForm store={pub} menu={menu} delivery={delivery} />
      </main>
      <StoreFooter store={pub} />
    </div>
  )
}
