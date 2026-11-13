"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Lock, Flame, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Turnstile } from "@/components/turnstile"
import { loginAction, type LoginState } from "./actions"

export function LoginForm({ turnstileSiteKey = null }: { turnstileSiteKey?: string | null }) {
  // Anti-robô: o botão espera o token; cada tentativa gasta o token, então a seguinte usa um widget novo (key)
  const [captcha, setCaptcha] = useState<{ token: string | null; key: number }>({ token: null, key: 0 })
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(async (prev, fd) => {
    const result = await loginAction(prev, fd)
    setCaptcha((c) => ({ token: null, key: c.key + 1 }))
    return result
  }, {})
  const waitingCaptcha = !!turnstileSiteKey && !captcha.token

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-3xl font-bold text-center mb-2 flex items-center gap-2">
            <Flame className="w-8 h-8 text-primary" />
            Painel da Loja
          </h1>
          <p className="text-muted-foreground text-center">Acesso para donos e funcionários</p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4 mx-auto">
              <Lock className="w-6 h-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">Digite seu e-mail e senha para acessar o painel</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    defaultValue={state.email}
                    disabled={isPending}
                    autoComplete="email"
                    className={state.fieldErrors?.email ? "border-destructive" : ""}
                  />
                  {state.fieldErrors?.email && <p className="text-sm text-destructive">{state.fieldErrors.email}</p>}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    disabled={isPending}
                    autoComplete="current-password"
                    className={state.fieldErrors?.password ? "border-destructive" : ""}
                  />
                  {state.fieldErrors?.password && (
                    <p className="text-sm text-destructive">{state.fieldErrors.password}</p>
                  )}
                </div>
                {state.error && (
                  <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive">
                    <p className="text-sm text-destructive">{state.error}</p>
                  </div>
                )}
                {turnstileSiteKey && (
                  <Turnstile
                    key={captcha.key}
                    siteKey={turnstileSiteKey}
                    action="login"
                    onToken={(token) => setCaptcha((c) => ({ ...c, token }))}
                  />
                )}
                <Button type="submit" className="w-full" disabled={isPending || waitingCaptcha}>
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Entrando...
                    </>
                  ) : waitingCaptcha ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verificando segurança...
                    </>
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </div>
              <div className="mt-6 text-center">
                <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  ← Voltar para página inicial
                </Link>
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                <Link href="/termos" className="underline underline-offset-2 hover:text-foreground">
                  Termos de uso
                </Link>{" "}
                ·{" "}
                <Link href="/privacidade" className="underline underline-offset-2 hover:text-foreground">
                  Política de privacidade
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
