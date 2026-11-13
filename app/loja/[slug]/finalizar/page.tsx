import { notFound } from "next/navigation"
import { brandStyle } from "@/lib/color"
import { getDeliveryConfig, getMenu, getStoreBySlug, publicStore } from "@/lib/orders"
import { StoreFooter, StoreHeader } from "@/components/store/store-header"
import { getAccountInfo } from "@/lib/mercadopago"
import { CheckoutForm } from "./checkout-form"
import { storeBase } from "@/lib/site-url"
import { getCustomer } from "@/lib/auth/customer"
import { getAddresses } from "@/lib/customer-account"

export const metadata = { title: "Finalizar pedido" }

export default async function FinalizarPage({ params }: { params: Promise<{ slug: string }> }) {
  const store = await getStoreBySlug((await params).slug)
  if (!store) notFound()
  const [menu, delivery, mp, me] = await Promise.all([getMenu(store.id), getDeliveryConfig(store), getAccountInfo(store.id), getCustomer()])
  const pub = publicStore(store, await storeBase(store.slug))
  // Conta do cliente (opcional): preenche nome/WhatsApp e oferece os endereços salvos
  const account = me
    ? {
        email: me.email,
        name: me.name,
        phone: me.phone,
        addresses: (await getAddresses(me.id)).map((a) => ({
          id: a.id,
          label: a.label,
          cep: a.cep,
          street: a.street,
          number: a.number,
          district: a.district,
          city: a.city,
          state: a.state,
          complement: a.complement,
        })),
      }
    : null

  return (
    <div style={brandStyle(pub.primaryColor)} className="min-h-screen flex flex-col bg-background">
      <StoreHeader store={pub} />
      <main className="flex-1">
        <CheckoutForm store={pub} menu={menu} delivery={delivery} pixOnline={!!mp && !mp.needsReconnect} account={account} />
      </main>
      <StoreFooter store={pub} />
    </div>
  )
}
