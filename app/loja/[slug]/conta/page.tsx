import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { LogOut, MapPin, Package, RotateCcw, Trash2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ActionButton } from "@/components/admin/form-ui"
import { StoreFooter, StoreHeader } from "@/components/store/store-header"
import { getCustomer } from "@/lib/auth/customer"
import { googleConfigured } from "@/lib/auth/google"
import { brandStyle } from "@/lib/color"
import { getAddresses, listCustomerOrders } from "@/lib/customer-account"
import { formatDateTimeSP } from "@/lib/dates"
import { localPath } from "@/lib/links"
import { emailConfigured } from "@/lib/email"
import { formatBRL, STATUS_LABEL } from "@/lib/order-shared"
import { getStoreBySlug, publicStore } from "@/lib/orders"
import { storeBase } from "@/lib/site-url"
import { AccountSection, AddressList } from "./account-sections"
import { AddressForm, LoginPanel, ProfileForm } from "./account-forms"
import { deleteAccountAction, logoutAction } from "./actions"

export const metadata = { title: "Minha conta", robots: { index: false } }

export default async function ContaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ entrar?: string; volta?: string }>
}) {
  const store = await getStoreBySlug((await params).slug)
  if (!store) notFound()
  const pub = publicStore(store, await storeBase(store.slug))
  const me = await getCustomer()
  // Veio do checkout ("Tem conta? Entre"): depois de entrar, volta para lá (só caminho deste site)
  const { volta } = await searchParams
  const back = localPath(volta)
  if (me && back) redirect(back)

  return (
    <div style={brandStyle(pub.primaryColor)} className="flex min-h-screen flex-col bg-background">
      <StoreHeader store={pub} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {me ? <Account customerId={me.id} email={me.email} name={me.name} phone={me.phone} storeBase={pub.base} /> : (
          <div className="mx-auto max-w-sm space-y-6">
            <div className="space-y-2 text-center">
              <UserRound className="mx-auto h-10 w-10 text-primary" aria-hidden />
              <h1 className="text-2xl font-bold">Entrar</h1>
              <p className="text-sm text-muted-foreground">
                Seus dados e endereços ficam salvos e você acompanha seus pedidos em qualquer aparelho. Vale para todas as lojas
                do RGM Pedidos. Não é obrigatório: você pode pedir sem conta.
              </p>
            </div>
            <LoginPanel slug={store.slug} google={googleConfigured()} email={emailConfigured()} notice={(await searchParams).entrar} />
            <p className="text-center text-xs text-muted-foreground">
              Ao entrar você concorda com os{" "}
              <Link href="/termos" className="underline underline-offset-2">
                Termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="underline underline-offset-2">
                Política de privacidade
              </Link>
              .
            </p>
            <Button asChild variant="ghost" className="w-full">
              <Link href={pub.base || "/"}>Voltar ao cardápio</Link>
            </Button>
          </div>
        )}
      </main>
      <StoreFooter store={pub} />
    </div>
  )
}

async function Account({ customerId, email, name, phone, storeBase: base }: { customerId: string; email: string; name: string | null; phone: string | null; storeBase: string }) {
  const [addresses, orders] = await Promise.all([getAddresses(customerId), listCustomerOrders(customerId)])
  // "Pedir de novo" abre o cardápio da loja do pedido (pode ser outra loja da plataforma)
  const bases = new Map(await Promise.all([...new Set(orders.map((o) => o.store.slug))].map(async (s) => [s, await storeBase(s)] as const)))

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Minha conta</h1>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={base || "/"}>Ver cardápio</Link>
          </Button>
          <ActionButton action={logoutAction} variant="outline" size="sm">
            <LogOut className="h-4 w-4" />
            Sair
          </ActionButton>
        </div>
      </div>

      <AccountSection title="Seus dados" description="Usados para preencher o pedido sozinho.">
        <ProfileForm name={name} phone={phone} />
      </AccountSection>

      <AccountSection title="Endereços" icon={<MapPin className="h-5 w-5" aria-hidden />}>
        <AddressList addresses={addresses} />
        <details className="group mt-4 rounded-xl border p-4 open:bg-muted/30">
          <summary className="cursor-pointer text-sm font-semibold text-primary">+ Adicionar endereço</summary>
          <div className="mt-4">
            <AddressForm />
          </div>
        </details>
      </AccountSection>

      <AccountSection title="Meus pedidos" icon={<Package className="h-5 w-5" aria-hidden />}>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Os pedidos feitos com a conta aparecem aqui.</p>
        ) : (
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.token} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {o.store.name} · #{o.orderNumber}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{o.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTimeSP(o.createdAt)} · {STATUS_LABEL[o.status]} · {formatBRL(o.total)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/pedido/${o.token}`}>Ver</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${bases.get(o.store.slug) || "/"}?pedirDeNovo=${encodeURIComponent(o.token)}`}>
                      <RotateCcw className="h-4 w-4" />
                      Pedir de novo
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AccountSection>

      <AccountSection title="Apagar minha conta" description="Apaga seu e-mail, nome, telefone e endereços. Os pedidos já feitos continuam com a loja, sem ligação com a conta.">
        <ActionButton
          action={deleteAccountAction}
          confirmText="Apagar a conta? Seus dados e endereços serão apagados e não dá para desfazer."
          variant="outline"
          size="sm"
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Apagar conta
        </ActionButton>
      </AccountSection>
    </div>
  )
}
