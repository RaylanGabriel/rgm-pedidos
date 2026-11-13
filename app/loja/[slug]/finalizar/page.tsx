import { notFound } from "next/navigation"
import { brandStyle } from "@/lib/color"
import { getDeliveryConfig, getMenu, getStoreBySlug, publicStore } from "@/lib/orders"
import { StoreFooter, StoreHeader } from "@/components/store/store-header"
import { getAccountInfo } from "@/lib/mercadopago"
import { CheckoutForm } from "./checkout-form"
import { storeBase } from "@/lib/site-url"
import { turnstileSiteKey } from "@/lib/turnstile"

export const metadata = { title: "Finalizar pedido" }

export default async function FinalizarPage({ params }: { params: Promise<{ slug: string }> }) {
  const store = await getStoreBySlug((await params).slug)
  if (!store) notFound()
  const [menu, delivery, mp] = await Promise.all([getMenu(store.id), getDeliveryConfig(store), getAccountInfo(store.id)])
  const pub = publicStore(store, await storeBase(store.slug))

  return (
    <div style={brandStyle(pub.primaryColor)} className="min-h-screen flex flex-col bg-background">
      <StoreHeader store={pub} />
      <main className="flex-1">
        <CheckoutForm store={pub} menu={menu} delivery={delivery} pixOnline={!!mp && !mp.needsReconnect} turnstileSiteKey={turnstileSiteKey()} />
      </main>
      <StoreFooter store={pub} />
    </div>
  )
}
