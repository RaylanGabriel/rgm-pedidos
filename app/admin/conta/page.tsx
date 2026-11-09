import Link from "next/link"
import { ArrowLeft, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSession } from "@/lib/auth/session"
import { PasswordForm } from "./password-form"

export const metadata = { title: "Minha conta" }

export default async function ContaPage() {
  const { user } = await requireSession()
  const firstAccess = user.mustChangePassword

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-md space-y-6">
        {!firstAccess && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
        )}

        <Card className="border-2">
          <CardHeader>
            <KeyRound className="w-8 h-8 text-primary mb-2" aria-hidden />
            <CardTitle className="text-2xl">{firstAccess ? "Crie sua senha" : "Minha conta"}</CardTitle>
            <CardDescription>
              {firstAccess
                ? `Bem-vindo(a), ${user.name}! Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.`
                : `${user.name} · ${user.email}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm email={user.email} />
          </CardContent>
        </Card>

        <form action="/auth/logout" method="post" className="text-center">
          <Button type="submit" variant="link" className="text-muted-foreground">
            Sair
          </Button>
        </form>
      </div>
    </div>
  )
}
