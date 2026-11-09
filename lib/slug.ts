/** "Dogão do Zé!" → "dogao-do-ze" (endereço da loja: /loja/<slug>). */
export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
