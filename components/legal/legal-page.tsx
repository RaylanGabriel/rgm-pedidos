import Link from "next/link"
import type { ReactNode } from "react"
import { LEGAL } from "@/lib/legal"

/** Moldura das páginas legais: título, data, texto e links entre os documentos. Abre em qualquer endereço do site. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{LEGAL.platform}</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Atualizada em {LEGAL.updatedAt}</p>
        <div className="mt-6 space-y-4 text-base leading-relaxed text-foreground/90">{intro}</div>
        <div className="mt-8 space-y-8">{children}</div>
        <nav aria-label="Documentos" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-sm">
          <Link href="/termos" className="underline underline-offset-2 hover:text-primary">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="underline underline-offset-2 hover:text-primary">
            Política de privacidade
          </Link>
          <a href={`mailto:${LEGAL.email}`} className="underline underline-offset-2 hover:text-primary">
            {LEGAL.email}
          </a>
        </nav>
      </div>
    </main>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="space-y-3 leading-relaxed text-foreground/90">{children}</div>
    </section>
  )
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
}

/** "mantida por Fulano (CPF/CNPJ ...)" conforme o que estiver em LEGAL. */
export function Responsible() {
  return (
    <>
      <strong>{LEGAL.responsible}</strong>
      {LEGAL.document && <> ({LEGAL.document})</>}
    </>
  )
}

export function ContactEmail() {
  return (
    <a href={`mailto:${LEGAL.email}`} className="font-medium underline underline-offset-2">
      {LEGAL.email}
    </a>
  )
}
