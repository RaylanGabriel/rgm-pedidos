/** Links externos montados a partir dos dados da loja (servem no servidor e no navegador). */

/** wa.me com DDI 55 (aceita o número com ou sem o 55) e mensagem opcional já escrita. */
export function whatsappLink(phone: string | null | undefined, text?: string) {
  const digits = phone?.replace(/\D/g, "") ?? ""
  if (digits.length < 10) return null
  const full = digits.length >= 12 && digits.startsWith("55") ? digits : `55${digits}`
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`
}

/** Busca do endereço no Google Maps (abre o app de mapas no celular). */
export function mapsLink(address: string | null | undefined) {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null
}

/** Tira protocolo, "www.", o domínio informado e barras/@ das pontas: o dono pode colar o link ou digitar o nome. */
function stripSocial(input: string, domains: RegExp) {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www|m|web)\./i, "")
    .replace(domains, "")
    .replace(/^@+/, "")
    .replace(/^\/+|\/+$/g, "")
}

/**
 * Instagram: aceita "@mrsmash", "mrsmash" ou "https://instagram.com/mrsmash/?igsh=..." → "mrsmash".
 * undefined = vazio; null = inválido.
 */
export function parseInstagram(input: string): string | undefined | null {
  if (!input.trim()) return undefined
  const domain = /^(instagram\.com|instagr\.am)\/?/i
  const rest = stripSocial(input, domain)
  // Link de outro site (tem "/" mas não é do Instagram): recusa em vez de adivinhar
  if (input.includes("/") && !domain.test(stripSocial(input, /$^/))) return null
  const user = rest.split(/[/?#]/)[0].toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(user) ? user : null
}

/** Facebook: aceita o link da página/perfil ou só o nome → "mrsmash" ou "profile.php?id=123". */
export function parseFacebook(input: string): string | undefined | null {
  if (!input.trim()) return undefined
  const rest = stripSocial(input, /^(facebook\.com|fb\.com)\/?/i)
  const profile = rest.match(/^profile\.php\?(?:.*&)?id=(\d{5,20})/i)
  if (profile) return `profile.php?id=${profile[1]}`
  const name = rest.split(/[?#]/)[0].replace(/\/+$/, "")
  return /^[A-Za-z0-9.-]{2,80}$/.test(name) ? name : null
}

export const instagramLink = (user: string | null | undefined) => (user ? `https://www.instagram.com/${user}/` : null)
export const facebookLink = (path: string | null | undefined) => (path ? `https://www.facebook.com/${path}` : null)

/** "11987654321" → "(11) 98765-4321" (aceita com 55 na frente). */
export function formatPhone(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone ?? ""
}

/** Caractere de controle (tab, quebra de linha…) ou barra invertida: o navegador os ignora/troca ao montar a URL. */
const UNSAFE_URL_CHARS = /[\u0000-\u001f\u007f\\]/

/**
 * Caminho deste site para voltar depois de uma ação ("?volta=/finalizar"), ou null se não for.
 * Não basta olhar o começo do texto: "/\t/site-falso.com" começa com uma barra só, mas o navegador apaga o tab e
 * lê "//site-falso.com" (outro site). Por isso recusa caracteres de controle e confere montando a URL de verdade.
 * E confere o RESULTADO, não só a entrada: "/.//site-falso.com" é deste site, mas o navegador apaga o "/." e devolve
 * "//site-falso.com" — que, usado de novo como destino, é outro site. Por isso o caminho final é montado outra vez.
 */
export function localPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || UNSAFE_URL_CHARS.test(raw)) return null
  const base = "https://local.invalid"
  try {
    const u = new URL(raw, base)
    if (u.origin !== base) return null
    const path = `${u.pathname}${u.search}${u.hash}`
    // o resultado também precisa ser um caminho deste site (nunca "//outro-site")
    return !path.startsWith("//") && new URL(path, base).origin === base ? path : null
  } catch {
    return null
  }
}

/** Endereço absoluto com caractere perigoso (ver localPath): nunca usar como destino de redirecionamento. */
export const hasUnsafeUrlChars = (raw: string) => UNSAFE_URL_CHARS.test(raw)
