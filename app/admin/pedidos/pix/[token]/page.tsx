import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { ArrowLeft, CheckCircle2, Plus, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AutoRefresh } from "@/components/auto-refresh"
import { requireStore } from "@/lib/auth/session"
import { getOrderByToken } from "@/lib/orders"
import { awaitingPix, formatBRL, PAYMENT_LABEL } from "@/lib/order-shared"
import { CounterPixActions, Countdown, CopyCode } from "./counter-pix"

export const metadata = { title: "Pix do balcão", robots: { index: false } }

/**
 * Balcão: QR do Pix na tela para o cliente pagar com o celular dele.
 * A página consulta o pagamento a cada 3 s (além do webhook) e mostra "Pago" quando cair.
 */
export default async function CounterPixPage({ params }: { params: Promise<{ token: string }> }) {
  const { store } = await requireStore()
  const data = await getOrderByToken((await params).token)
  if (!data || data.store.id !== store.id) notFound()
  const { order } = data

  const waiting = awaitingPix(order)
  const paid = order.paymentStatus === "paid"
  const cancelled = order.status === "cancelled"
  const qrSvg = waiting && order.pixCode ? await QRCode.toString(order.pixCode, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : ""

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {waiting && <AutoRefresh seconds={3} />}
      <div className="container mx-auto max-w-lg space-y-6 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/pedidos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Pedidos
          </Link>
        </Button>

        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pedido #{order.orderNumber} · {order.customerName}
          </p>
          <p className="mt-1 text-5xl font-extrabold tabular-nums">{formatBRL(order.total)}</p>
        </div>

        {waiting && order.pixCode && order.pixExpiresAt ? (
          <section aria-labelledby="pix-title" className="space-y-4 rounded-3xl border-2 border-primary bg-card p-5 text-center shadow-sm">
            <h1 id="pix-title" className="text-xl font-extrabold">
              Aponte a câmera do celular para pagar
            </h1>
            <p className="text-sm text-muted-foreground">No app do banco: Pix → Pagar com QR code.</p>
            {/* SVG gerado no servidor a partir do código do Mercado Pago */}
            <div
              className="mx-auto w-72 max-w-full rounded-2xl bg-white p-3"
              role="img"
              aria-label="QR code do Pix"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Countdown expiresAt={order.pixExpiresAt} />
              <CopyCode code={order.pixCode} />
            </div>
            <p role="status" className="text-sm font-medium text-muted-foreground">
              Aguardando o pagamento… esta tela muda sozinha quando o Pix cair.
            </p>
          </section>
        ) : paid ? (
          <section role="status" className="space-y-2 rounded-3xl border-2 border-green-300 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-950">
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" aria-hidden />
            <h1 className="text-2xl font-extrabold">Pix recebido!</h1>
            <p className="text-muted-foreground">O pedido já foi para a cozinha.</p>
          </section>
        ) : cancelled ? (
          <section role="status" className="space-y-2 rounded-3xl border-2 border-destructive/30 bg-destructive/5 p-6 text-center">
            <XCircle className="mx-auto h-14 w-14 text-destructive" aria-hidden />
            <h1 className="text-2xl font-extrabold">Pedido cancelado</h1>
            <p className="text-muted-foreground">{order.pixCode ? "O Pix venceu ou foi cancelado sem pagamento." : "O pedido foi cancelado."}</p>
          </section>
        ) : (
          <section role="status" className="space-y-2 rounded-3xl border-2 bg-card p-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-primary" aria-hidden />
            <h1 className="text-2xl font-extrabold">Pedido enviado para a cozinha</h1>
            <p className="text-muted-foreground">Pagamento: {PAYMENT_LABEL[order.paymentMethod]} (direto com a loja).</p>
          </section>
        )}

        {waiting ? (
          <CounterPixActions orderId={order.id} />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="flex-1">
              <Link href="/admin/pedidos/novo">
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Novo pedido
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="flex-1">
              <Link href="/admin/pedidos">Ver pedidos</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
