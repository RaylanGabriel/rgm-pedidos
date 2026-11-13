"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { deleteCustomerSession, getCustomer } from "@/lib/auth/customer"
import { requestLoginCode, verifyLoginCode } from "@/lib/auth/customer-code"
import { addressSchema, deleteAddress, deleteCustomer, profileSchema, reorderItems, saveAddress, updateProfile } from "@/lib/customer-account"
import { formText, zodErrorState, type FormState } from "@/lib/form-state"
import { getStoreBySlug } from "@/lib/orders"

/*
 * Ações da conta do cliente. A conta vem SEMPRE da sessão (cookie csid), nunca do formulário.
 */

const refresh = () => revalidatePath("/loja/[slug]/conta", "page")
const NOT_LOGGED: FormState = { error: "Sua sessão terminou. Entre de novo." }
const uuid = z.string().uuid()

export async function requestCodeAction(slug: string, email: string) {
  const store = await getStoreBySlug(slug)
  return requestLoginCode(email, store?.name ?? null)
}

export async function verifyCodeAction(email: string, code: string) {
  const r = await verifyLoginCode(email, code)
  if ("ok" in r) refresh()
  return r
}

export async function logoutAction() {
  await deleteCustomerSession()
  refresh()
}

export async function saveProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await getCustomer()
  if (!me) return NOT_LOGGED
  const parsed = profileSchema.safeParse({ name: formText(fd, "name"), phone: formText(fd, "phone") })
  if (!parsed.success) return zodErrorState(parsed.error)
  await updateProfile(me.id, parsed.data)
  refresh()
  return { ok: true, message: "Dados salvos." }
}

export async function saveAddressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await getCustomer()
  if (!me) return NOT_LOGGED
  const id = formText(fd, "id")
  if (id && !uuid.safeParse(id).success) return { error: "Endereço inválido." }
  const parsed = addressSchema.safeParse(
    Object.fromEntries(["label", "cep", "street", "number", "district", "city", "state", "complement"].map((k) => [k, formText(fd, k)])),
  )
  if (!parsed.success) return zodErrorState(parsed.error)
  try {
    await saveAddress(me.id, { ...parsed.data, state: parsed.data.state?.toUpperCase() ?? null }, id || undefined)
  } catch (e) {
    if (e instanceof Error && e.message === "ADDRESS_LIMIT") return { error: "Limite de 10 endereços. Apague um antes." }
    throw e
  }
  refresh()
  return { ok: true, message: id ? "Endereço atualizado." : "Endereço salvo." }
}

export async function deleteAddressAction(id: string) {
  const me = await getCustomer()
  if (!me || !uuid.safeParse(id).success) return
  await deleteAddress(me.id, id)
  refresh()
}

export async function deleteAccountAction() {
  const me = await getCustomer()
  if (!me) return
  await deleteCustomerSession()
  await deleteCustomer(me.id)
  refresh()
}

/** "Pedir de novo": itens do pedido, só se for desta loja (o navegador confere contra o cardápio atual). */
export async function reorderAction(slug: string, token: string) {
  const store = await getStoreBySlug(slug)
  if (!store || typeof token !== "string" || token.length > 100) return null
  const r = await reorderItems(token)
  return r && r.storeId === store.id ? r.lines : null
}
