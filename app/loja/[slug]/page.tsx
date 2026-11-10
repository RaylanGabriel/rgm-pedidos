import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { brandStyle } from "@/lib/color"
import { Store } from "lucide-react"
import { getDeliveryConfig, getMenu, getStoreBySlug, getSuspendedStoreName, publicStore } from "@/lib/orders"
import { StoreFooter, StoreHero } from "@/components/store/store-header"
import { StoreMenu } from "./store-menu"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getStoreBySlug((await params).slug)
  return store ? { title: `${store.name} · Cardápio`, description: `Faça seu pedido em ${store.name}` } : {}
}

export default async function LojaPage({ params }: Props) {
  const { slug } = await params
  const store = await getStoreBySlug(slug)
  if (!store) {
    const suspendedName = await getSuspendedStoreName(slug)
    if (!suspendedName) notFound()
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted">
        <div className="max-w-sm text-center space-y-2">
          <Store className="w-10 h-10 mx-auto text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-bold">{suspendedName}</h1>
          <p className="text-muted-foreground">O cardápio online está indisponível no momento. Volte mais tarde!</p>
        </div>
      </main>
    )
  }
  const [menu, delivery] = await Promise.all([getMenu(store.id), getDeliveryConfig(store)])
  const pub = publicStore(store)

  return (
    <div style={brandStyle(pub.primaryColor)} className="min-h-screen flex flex-col bg-background">
      <StoreHero store={pub} delivery={delivery} />
      <main className="flex-1">
        <StoreMenu store={pub} menu={menu} />
      </main>
      <StoreFooter store={pub} />
    </div>
  )
}
