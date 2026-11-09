import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardList, UtensilsCrossed } from "lucide-react"
import Image from "next/image"
import { ClientHeader } from "@/components/client-header"
import { ClientFooter } from "@/components/client-footer"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted">
      <ClientHeader />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex flex-col items-center justify-center mb-12">
            <div className="relative w-48 h-48 mb-6">
              <Image src="/logo.png" alt="Mr. Smash Street Logo" fill className="object-contain" priority />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-center mb-2 text-foreground">Mr. Smash Street</h1>
            <p className="text-xl text-muted-foreground text-center">Faça seu pedido</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Link href="/cardapio" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-primary bg-gradient-to-br from-card to-card/80">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4 group-hover:bg-accent transition-colors">
                    <UtensilsCrossed className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Fazer Pedido</CardTitle>
                  <CardDescription>Veja nosso cardápio e faça seu pedido</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Escolha seus lanches favoritos e personalize com ingredientes extras
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/meu-pedido" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:scale-105 border-2 hover:border-accent bg-gradient-to-br from-card to-card/80">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                    <ClipboardList className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Meu Pedido</CardTitle>
                  <CardDescription>Acompanhe o status do seu pedido</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Veja o tempo de espera e status em tempo real</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </main>

      <ClientFooter />
    </div>
  )
}
