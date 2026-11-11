"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { isOwner } from "@/lib/auth/session"
import { connectPlatformOwnerAccount, connectPlatformTestAccount, disconnectStore, mpTestMode, ownerAccountAvailable } from "@/lib/mercadopago"

export async function disconnectMercadoPagoAction() {
  const ctx = await isOwner()
  if (!ctx) return
  await disconnectStore(ctx.store.id)
  revalidatePath("/admin/pagamentos")
  redirect("/admin/pagamentos?ok=desconectado")
}

/** Só em modo de teste e só para o super admin: usa a conta de teste da plataforma (sem passar pelo OAuth). */
export async function connectTestAccountAction() {
  const ctx = await isOwner()
  if (!ctx || !ctx.user.isSuperadmin || !mpTestMode()) return
  await connectPlatformTestAccount(ctx.store.id, ctx.user.id)
  revalidatePath("/admin/pagamentos")
  redirect("/admin/pagamentos?ok=teste")
}

/** Só em produção e só para o super admin: usa a conta dona do app (loja própria, sem OAuth). */
export async function connectOwnerAccountAction() {
  const ctx = await isOwner()
  if (!ctx || !ctx.user.isSuperadmin || !ownerAccountAvailable()) return
  await connectPlatformOwnerAccount(ctx.store.id, ctx.user.id)
  revalidatePath("/admin/pagamentos")
  redirect("/admin/pagamentos?ok=dona")
}
