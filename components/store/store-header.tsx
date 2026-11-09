import Image from "next/image"
import Link from "next/link"
import type { PublicStore } from "@/lib/orders"

export function StoreHeader({ store }: { store: Pick<PublicStore, "slug" | "name" | "logoUrl" | "isOpen"> }) {
  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link href={`/loja/${store.slug}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0">
          {store.logoUrl && (
            <div className="relative w-14 h-14 md:w-16 md:h-16 shrink-0">
              <Image src={store.logoUrl} alt={`Logo ${store.name}`} fill className="object-contain" />
            </div>
          )}
          <span className="text-xl font-bold text-foreground truncate">{store.name}</span>
        </Link>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
            store.isOpen ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"
          }`}
        >
          {store.isOpen ? "Aberto" : "Fechado"}
        </span>
      </div>
    </header>
  )
}

export function StoreFooter({ store }: { store: Pick<PublicStore, "name" | "phone"> }) {
  const phoneDigits = store.phone?.replace(/\D/g, "")
  return (
    <footer className="mt-16 border-t border-border/40 bg-card">
      <div className="container mx-auto px-4 py-8 text-center text-sm text-muted-foreground space-y-2">
        {phoneDigits && (
          <p>
            Dúvidas? Fale com a loja:{" "}
            <a className="text-primary font-medium hover:underline" href={`https://wa.me/55${phoneDigits}`} target="_blank" rel="noopener noreferrer">
              WhatsApp {store.phone}
            </a>
          </p>
        )}
        <p>&copy; {new Date().getFullYear()} {store.name}</p>
      </div>
    </footer>
  )
}
