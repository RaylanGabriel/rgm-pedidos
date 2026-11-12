import { defineCloudflareConfig } from "@opennextjs/cloudflare"

/**
 * Quase todas as rotas são dinâmicas (ƒ) e não usamos ISR nem cache de fetch, então começamos sem cache
 * incremental (R2/D1). `revalidatePath` nas server actions continua atualizando a tela de quem salvou.
 * Se um dia entrar ISR, ver https://opennext.js.org/cloudflare/caching (R2 + D1 tag cache).
 */
export default defineCloudflareConfig({})
