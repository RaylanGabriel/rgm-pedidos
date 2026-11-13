import Image from "next/image"
import Link from "next/link"
import { Bike, Clock, Facebook, Instagram, MapPin, ShoppingBag, Store as StoreIcon } from "lucide-react"
import { facebookLink, instagramLink, mapsLink, whatsappLink } from "@/lib/links"
import type { PublicStore } from "@/lib/orders"
import { deliveryAvailable, formatBRL, formatKm, type DeliveryConfig } from "@/lib/order-shared"

/** Resumo da entrega para o topo da loja (o cliente sabe o custo antes de escolher). */
function deliveryLabel(d: DeliveryConfig) {
  if (!deliveryAvailable(d)) return "Só retirada"
  if (d.pricing === "fixed") return d.fixedFee > 0 ? `Entrega ${formatBRL(d.fixedFee)}` : "Entrega grátis"
  if (d.pricing === "distance") {
    const first = d.tiers[0]
    const max = d.tiers.at(-1)?.upToKm ?? 0
    return first.fee === 0 ? `Entrega grátis até ${formatKm(first.upToKm)} · até ${formatKm(max)}` : `Entrega até ${formatKm(max)}`
  }
  const min = Math.min(...d.zones.map((z) => z.fee))
  return min > 0 ? `Entrega a partir de ${formatBRL(min)}` : "Entrega a partir de grátis"
}

/** Logo do WhatsApp (a lucide não tem): reconhecível mesmo sem o texto. */
function WhatsappIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.45-5.03c0-5.2 4.24-9.44 9.45-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.44-9.45 9.44m8.04-17.48A11.3 11.3 0 0 0 12.04.7C5.78.7.68 5.8.68 12.06c0 2 .52 3.96 1.52 5.68L.6 23.6l6-1.57a11.3 11.3 0 0 0 5.43 1.38h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.03-1.18-5.89-3.32-8.03" />
    </svg>
  )
}

type SocialStore = Pick<PublicStore, "phone" | "instagram" | "facebook">

/** WhatsApp, Instagram e Facebook da loja (só os que o dono preencheu). */
function socialLinks(store: SocialStore) {
  return [
    { key: "whatsapp", label: "WhatsApp", icon: WhatsappIcon, href: whatsappLink(store.phone) },
    { key: "instagram", label: "Instagram", icon: Instagram, href: instagramLink(store.instagram) },
    { key: "facebook", label: "Facebook", icon: Facebook, href: facebookLink(store.facebook) },
  ].filter((l): l is typeof l & { href: string } => !!l.href)
}

/**
 * Botões das redes sociais (alvo de toque de 40px, abre em outra aba).
 * compact: no celular só o ícone (cabe numa linha no topo); o nome continua para leitor de tela.
 */
function SocialLinks({ store, compact = false, className = "" }: { store: SocialStore; compact?: boolean; className?: string }) {
  const links = socialLinks(store)
  if (links.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} aria-label="Redes sociais da loja">
      {links.map(({ key, label, icon: Icon, href }) => (
        <li key={key}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={compact ? label : undefined}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              compact ? "w-10 sm:w-auto sm:px-4" : "px-4"
            }`}
          >
            <Icon className={compact ? "h-[18px] w-[18px] sm:h-4 sm:w-4" : "h-4 w-4"} aria-hidden />
            <span className={compact ? "sr-only sm:not-sr-only" : ""}>{label}</span>
            <span className="sr-only"> (abre em outra aba)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Topo do cardápio: capa na cor da loja, logo, nome, status e informações rápidas. */
export function StoreHero({ store, delivery }: { store: PublicStore; delivery: DeliveryConfig }) {
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
            {store.openLabel && <span className="ml-2 text-xs font-medium text-muted-foreground">{store.openLabel}</span>}
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
        </ul>
        <SocialLinks store={store} compact className="mt-3" />
      </div>
    </header>
  )
}

/** Cabeçalho compacto (checkout, acompanhamento): logo + nome, volta para o cardápio. */
export function StoreHeader({ store }: { store: Pick<PublicStore, "base" | "name" | "logoUrl" | "isOpen"> }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="container mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href={store.base || "/"} className="flex min-w-0 items-center gap-3 rounded-xl transition hover:opacity-80">
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

/**
 * Rodapé. Computador: 3 colunas alinhadas pelo topo (loja + endereço · horário · contato). Celular: tudo
 * centralizado, sem os títulos das colunas. Sem endereço, horário nem redes: só a linha legal.
 */
export function StoreFooter({
  store,
}: {
  store: Pick<PublicStore, "name" | "phone" | "address" | "instagram" | "facebook" | "weekHours">
}) {
  const map = mapsLink(store.address)
  const legal = (
    <p className="container mx-auto max-w-6xl px-4 pb-6 text-center text-xs text-muted-foreground sm:text-left">
      Pedidos online por <span className="font-semibold text-foreground">RGM Pedidos</span> ·{" "}
      <Link href="/termos" className="underline underline-offset-2 hover:text-foreground">
        Termos de uso
      </Link>{" "}
      ·{" "}
      <Link href="/privacidade" className="underline underline-offset-2 hover:text-foreground">
        Privacidade
      </Link>
    </p>
  )
  if (!map && !store.weekHours && socialLinks(store).length === 0)
    return <footer className="mt-16 border-t bg-card pt-6">{legal}</footer>
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="container mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-center sm:flex-row sm:items-start sm:justify-between sm:gap-10 sm:text-left">
        <div className="min-w-0 space-y-1 sm:max-w-sm">
          <p className="font-bold">{store.name}</p>
          {map && (
            <a
              href={map}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-balance text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              <MapPin className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden />
              {store.address}
              <span className="sr-only"> (abre o mapa)</span>
            </a>
          )}
        </div>
        {store.weekHours && (
          <div>
            <p className="mb-1 hidden font-bold sm:block">Horário</p>
            {/* Grade de 2 colunas: os horários começam todos na mesma linha vertical */}
            <dl className="inline-grid grid-cols-[auto_auto] gap-x-2 text-sm text-muted-foreground">
              {store.weekHours.map(([days, time]) => (
                <div key={days} className="contents">
                  <dt className="text-right sm:text-left">{days}:</dt>
                  <dd className="text-left font-medium tabular-nums text-foreground/80">{time}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {socialLinks(store).length > 0 && (
          <div>
            <p className="mb-2 hidden font-bold sm:block">Fale com a gente</p>
            <SocialLinks store={store} compact className="justify-center sm:justify-start" />
          </div>
        )}
      </div>
      {legal}
    </footer>
  )
}
