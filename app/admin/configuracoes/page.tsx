import Link from "next/link"
import { headers } from "next/headers"
import QRCode from "qrcode"
import { ArrowLeft, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireOwner } from "@/lib/auth/session"
import { SettingsForm } from "./settings-form"

export const metadata = { title: "Configurações" }

/** Endereço público do site (variável de ambiente em produção; senão, o host da requisição). */
async function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

export default async function ConfiguracoesPage() {
  const { store } = await requireOwner()
  const storeUrl = `${await siteUrl()}/loja/${store.slug}`
  const qrSvg = await QRCode.toString(storeUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
  const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Link>
        </Button>

        <h1 className="text-4xl font-bold">Configurações</h1>

        <Card>
          <CardHeader>
            <CardTitle>Dados da loja</CardTitle>
            <CardDescription>O que o cliente vê no cardápio e na tela do pedido.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              values={{
                name: store.name,
                phone: store.phone,
                logoUrl: store.logoUrl,
                primaryColor: store.primaryColor,
                avgPrepMinutes: store.avgPrepMinutes,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Link e QR code do cardápio</CardTitle>
            <CardDescription>Imprima e cole no balcão: o cliente aponta a câmera e faz o pedido.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-6 items-center">
            {/* SVG gerado no servidor pela biblioteca qrcode a partir do nosso próprio link */}
            <div
              className="w-48 h-48 shrink-0 rounded-lg bg-white p-2 [&>svg]:w-full [&>svg]:h-full"
              role="img"
              aria-label={`QR code para ${storeUrl}`}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="space-y-3 min-w-0 w-full">
              <p className="font-mono text-sm break-all rounded-md bg-muted px-3 py-2">{storeUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={qrDataUrl} download={`qrcode-${store.slug}.svg`}>
                    <Download className="w-4 h-4" />
                    Baixar QR code
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/loja/${store.slug}`} target="_blank">
                    <ExternalLink className="w-4 h-4" />
                    Abrir cardápio
                  </Link>
                </Button>
              </div>
              {storeUrl.includes("localhost") && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Este link é do seu computador. Depois do deploy, o QR code passa a apontar para o endereço público.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
