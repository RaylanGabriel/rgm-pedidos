import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { LoginForm } from "./login-form"

export default async function LoginPage() {
  // Já logado (sessão válida no banco, não só o cookie) → vai direto para o painel
  if (await getSession()) redirect("/admin")
  return <LoginForm />
}
