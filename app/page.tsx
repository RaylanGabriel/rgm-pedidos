import { redirect } from "next/navigation"

/**
 * Por enquanto a raiz leva à loja padrão.
 * Quando a plataforma tiver uma página própria (apresentação para novos carrinhos), ela entra aqui.
 */
export default function Home() {
  redirect(`/loja/${process.env.DEFAULT_STORE_SLUG || "mr-smash"}`)
}
