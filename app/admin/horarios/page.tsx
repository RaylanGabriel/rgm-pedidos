import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireOwner } from "@/lib/auth/session"
import { parseHours } from "@/lib/hours"
import { HoursForm } from "./hours-form"

export const metadata = { title: "Horários" }

export default async function HorariosPage() {
  const { store } = await requireOwner()

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
          <h1 className="text-3xl font-bold">Horário de funcionamento</h1>
          <p className="text-muted-foreground">
            A loja abre e fecha sozinha para pedidos pelo site. Precisa fechar mais cedo ou abrir num dia diferente? Use o botão
            &quot;Fechar agora / Abrir agora&quot; no início do painel: ele vale só até o próximo horário.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <HoursForm enabled={store.hoursEnabled} hours={parseHours(store.openingHours)} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
