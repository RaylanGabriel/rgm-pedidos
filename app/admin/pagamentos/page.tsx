import Link from "next/link"
import { ArrowLeft, CheckCircle2, ExternalLink, ShieldCheck, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/admin/form-ui"
import { requireOwner } from "@/lib/auth/session"
import { formatDateTimeSP } from "@/lib/dates"
import { getAccountInfo, mpConfigured, mpTestMode, ownerAccountAvailable } from "@/lib/mercadopago"
import { connectOwnerAccountAction, connectTestAccountAction, disconnectMercadoPagoAction } from "./actions"

export const metadata = { title: "Pagamentos" }

const MESSAGES: Record<string, { tone: "ok" | "erro"; text: string }> = {
  "ok=conectado": { tone: "ok", text: "Mercado Pago conectado! O Pix dos pedidos agora cai direto na sua conta." },
  "ok=dona": { tone: "ok", text: "Loja ligada à conta dona da plataforma (produção). O Pix cai direto nessa conta." },
  "ok=teste": { tone: "ok", text: "Conta de teste da plataforma ligada a esta loja (modo de teste)." },
  "ok=desconectado": { tone: "ok", text: "Mercado Pago desconectado. Os pedidos com Pix voltam a ser pagos direto com a loja." },
  "erro=negado": { tone: "erro", text: "A conexão foi cancelada no Mercado Pago. Tente de novo quando quiser." },
  "erro=expirou": { tone: "erro", text: "A conexão demorou demais ou veio de outra janela. Toque em Conectar de novo." },
  "erro=falhou": { tone: "erro", text: "O Mercado Pago não confirmou a conexão. Tente de novo em alguns minutos." },
  "erro=config": { tone: "erro", text: "A integração com o Mercado Pago ainda não está configurada na plataforma." },
}

type SP = Promise<{ ok?: string; erro?: string }>

export default async function PagamentosPage({ searchParams }: { searchParams: SP }) {
  const { store, user } = await requireOwner()
  const sp = await searchParams
  const connected = await getAccountInfo(store.id)
  // Conectada no modo de teste com a plataforma já em produção: vale como "não conectada" (precisa reconectar)
  const stale = connected?.needsReconnect ? connected : null
  const account = stale ? null : connected
  const msg = sp.ok ? MESSAGES[`ok=${sp.ok}`] : sp.erro ? MESSAGES[`erro=${sp.erro}`] : undefined
  const configured = mpConfigured()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>

        <div>
          <h1 className="text-3xl font-bold">Pagamentos</h1>
          <p className="text-muted-foreground">Receba o Pix dos pedidos direto na sua conta do Mercado Pago.</p>
        </div>

        {msg && (
          <p
            role={msg.tone === "erro" ? "alert" : "status"}
            className={`rounded-lg p-3 text-sm ${msg.tone === "ok" ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" : "bg-destructive/10 text-destructive"}`}
          >
            {msg.text}
          </p>
        )}

        {mpTestMode() && (
          <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <strong>Modo de teste:</strong> os Pix gerados são de mentira e se aprovam sozinhos. Nenhum dinheiro de verdade é cobrado.
          </p>
        )}

        {stale && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <span>
              <strong>Reconecte o Mercado Pago:</strong> a conta ligada era de teste e não recebe Pix de verdade. Enquanto isso, o Pix é
              pago direto com a loja.
            </span>
            <ActionButton action={disconnectMercadoPagoAction} variant="outline" size="sm">
              Remover conta de teste
            </ActionButton>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {account ? <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden /> : <Zap className="h-5 w-5 text-primary" aria-hidden />}
              Mercado Pago {account ? "conectado" : "não conectado"}
            </CardTitle>
            <CardDescription>
              {account
                ? `Conta ${account.mpUserId}${account.liveMode ? "" : " (teste)"} · conectada em ${formatDateTimeSP(account.connectedAt.toISOString())}`
                : "Conecte para o cliente pagar o Pix pelo site, com confirmação automática."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {account ? (
              <>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li>✓ Pedido com Pix mostra QR code e copia e cola para o cliente.</li>
                  <li>✓ O pedido só entra na cozinha depois que o Pix é pago.</li>
                  <li>✓ Pix não pago em 30 minutos é cancelado sozinho.</li>
                </ul>
                <ActionButton
                  action={disconnectMercadoPagoAction}
                  variant="outline"
                  confirmText="Desconectar o Mercado Pago? Os pedidos com Pix passam a ser pagos direto com a loja."
                >
                  Desconectar
                </ActionButton>
              </>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li>• O dinheiro cai na <strong className="text-foreground">sua</strong> conta do Mercado Pago, não passa pela plataforma.</li>
                  <li>• O pedido só vai para a cozinha depois de pago: acabou o “paguei, mas não caiu”.</li>
                  <li>• Você não precisa conferir comprovante.</li>
                  <li>• Sua conta do Mercado Pago precisa ter uma <strong className="text-foreground">chave Pix</strong> cadastrada.</li>
                </ul>
                {configured ? (
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <a href="/admin/mercado-pago/conectar">
                      Conectar Mercado Pago
                      <ExternalLink className="ml-2 h-4 w-4" aria-hidden />
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-destructive">Integração ainda não configurada na plataforma.</p>
                )}
                {ownerAccountAvailable() && user.isSuperadmin && (
                  <div className="border-t pt-4">
                    <p className="mb-2 text-xs text-muted-foreground">Só você vê (super admin): para lojas suas, sem passar pelo Conectar.</p>
                    <ActionButton
                      action={connectOwnerAccountAction}
                      variant="secondary"
                      size="sm"
                      confirmText="Ligar esta loja à SUA conta do Mercado Pago (dona da plataforma)? O Pix desta loja vai cair na sua conta."
                    >
                      Usar a conta dona da plataforma (produção)
                    </ActionButton>
                  </div>
                )}
                {mpTestMode() && user.isSuperadmin && (
                  <div className="border-t pt-4">
                    <p className="mb-2 text-xs text-muted-foreground">Só você vê (super admin, modo de teste):</p>
                    <ActionButton action={connectTestAccountAction} variant="secondary" size="sm">
                      Usar conta de teste da plataforma
                    </ActionButton>
                  </div>
                )}
              </>
            )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              A plataforma não vê sua senha. A autorização fica guardada criptografada e você pode desconectar a qualquer momento, aqui ou
              no próprio Mercado Pago.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
