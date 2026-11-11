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
