import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { brandStyle } from "@/lib/color"
import { getMenu, getStoreBySlug, publicStore } from "@/lib/orders"
import { StoreFooter, StoreHeader } from "@/components/store/store-header"
import { StoreMenu } from "./store-menu"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getStoreBySlug((await params).slug)
  return store ? { title: `${store.name} · Cardápio`, description: `Faça seu pedido em ${store.name}` } : {}
}

export default async function LojaPage({ params }: Props) {
  const store = await getStoreBySlug((await params).slug)
  if (!store) notFound()
  const menu = await getMenu(store.id)
  const pub = publicStore(store)

  return (
    <div style={brandStyle(pub.primaryColor)} className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted">
      <StoreHeader store={pub} />
      <main className="flex-1">
        <StoreMenu store={pub} menu={menu} />
      </main>
      <StoreFooter store={pub} />
    </div>
  )
}
