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

/** "11987654321" → "(11) 98765-4321" (aceita com 55 na frente). */
export function formatPhone(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone ?? ""
}
