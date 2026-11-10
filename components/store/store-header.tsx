import Image from "next/image"
import Link from "next/link"
import { Bike, Clock, MapPin, MessageCircle, ShoppingBag, Store as StoreIcon } from "lucide-react"
import { formatPhone, mapsLink, whatsappLink } from "@/lib/links"
import type { PublicStore } from "@/lib/orders"
import { deliveryAvailable, formatBRL, type DeliveryConfig } from "@/lib/order-shared"

/** Resumo da entrega para o topo da loja (o cliente sabe o custo antes de escolher). */
function deliveryLabel(d: DeliveryConfig) {
  if (!deliveryAvailable(d)) return "Só retirada"
  if (d.pricing === "fixed") return d.fixedFee > 0 ? `Entrega ${formatBRL(d.fixedFee)}` : "Entrega grátis"
  const min = Math.min(...d.zones.map((z) => z.fee))
  return min > 0 ? `Entrega a partir de ${formatBRL(min)}` : "Entrega a partir de grátis"
}

/** Topo do cardápio: capa na cor da loja, logo, nome, status e informações rápidas. */
export function StoreHero({ store, delivery }: { store: PublicStore; delivery: DeliveryConfig }) {
  const whats = whatsappLink(store.phone)
  const map = mapsLink(store.address)
  const chips = [
    { icon: Clock, text: `~${store.avgPrepMinutes} min` },
    { icon: deliveryAvailable(delivery) ? Bike : ShoppingBag, text: deliveryLabel(delivery) },
    ...(deliveryAvailable(delivery) && delivery.minOrder > 0 ? [{ icon: ShoppingBag, text: `Mínimo ${formatBRL(delivery.minOrder)}` }] : []),
  ]

  return (
    <header>
      {store.coverUrl ? (
        <div className="relative h-36 overflow-hidden bg-muted sm:h-56">
          <Image src={store.coverUrl} alt="" fill priority sizes="100vw" className="object-cover" />
          {/* escurece levemente a base para o logo "flutuar" sem sumir em fotos claras */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" aria-hidden />
        </div>
      ) : (
        <div
          className="h-28 sm:h-40"
          style={{
            background:
              "radial-gradient(120% 140% at 85% 0%, color-mix(in oklch, var(--primary), white 18%) 0%, var(--primary) 45%, color-mix(in oklch, var(--primary), black 45%) 100%)",
          }}
          aria-hidden
        />
      )}
      <div className="container mx-auto max-w-6xl px-4">
        <div className="-mt-12 flex items-end gap-4 sm:-mt-14">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border-4 border-background bg-white shadow-lg sm:h-28 sm:w-28">
            {store.logoUrl ? (
              <Image src={store.logoUrl} alt={`Logo ${store.name}`} fill sizes="112px" className="object-contain p-1" priority />
            ) : (
              <StoreIcon className="absolute inset-0 m-auto h-10 w-10 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="min-w-0 pb-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                store.isOpen ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${store.isOpen ? "bg-green-600" : "bg-muted-foreground"}`} aria-hidden />
              {store.isOpen ? "Aberto agora" : "Fechado"}
            </span>
          </div>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{store.name}</h1>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {chips.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-1.5">
              <Icon className="h-4 w-4" aria-hidden />
              {text}
            </li>
          ))}
          {map && (
            <li>
              <a href={map} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground hover:underline">
                <MapPin className="h-4 w-4" aria-hidden />
                {store.address}
              </a>
            </li>
          )}
          {whats && (
            <li>
              <a
                href={whats}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </li>
          )}
        </ul>
      </div>
    </header>
  )
}

/** Cabeçalho compacto (checkout, acompanhamento): logo + nome, volta para o cardápio. */
export function StoreHeader({ store }: { store: Pick<PublicStore, "slug" | "name" | "logoUrl" | "isOpen"> }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="container mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href={`/loja/${store.slug}`} className="flex min-w-0 items-center gap-3 rounded-xl transition hover:opacity-80">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border bg-white">
            {store.logoUrl ? (
              <Image src={store.logoUrl} alt="" fill sizes="40px" className="object-contain p-0.5" />
            ) : (
              <StoreIcon className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" aria-hidden />
            )}
          </span>
          <span className="truncate font-bold">{store.name}</span>
        </Link>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
            store.isOpen ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${store.isOpen ? "bg-green-600" : "bg-muted-foreground"}`} aria-hidden />
          {store.isOpen ? "Aberto" : "Fechado"}
        </span>
      </div>
    </header>
  )
}

export function StoreFooter({ store }: { store: Pick<PublicStore, "name" | "phone"> }) {
  const whats = whatsappLink(store.phone)
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="container mx-auto space-y-2 px-4 py-8 text-center text-sm text-muted-foreground">
        {whats && (
          <p>
            Dúvidas? Fale com a loja:{" "}
            <a className="font-medium text-primary hover:underline" href={whats} target="_blank" rel="noopener noreferrer">
              WhatsApp {formatPhone(store.phone)}
            </a>
          </p>
        )}
        <p>&copy; {new Date().getFullYear()} {store.name}</p>
      </div>
    </footer>
  )
}
