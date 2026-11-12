/**
 * Quem responde pela plataforma nos Termos de uso e na Política de privacidade (/termos, /privacidade).
 * Mudou algo (CNPJ do MEI, e-mail)? Troque aqui e atualize `updatedAt`.
 */
export const LEGAL = {
  platform: "RGM Pedidos",
  responsible: "Raylan Gabriel dos Santos Miranda",
  /** CPF/CNPJ publicado nas páginas. null = não publicar (nome + contato bastam para a LGPD). */
  document: null as string | null,
  email: "contato@rgm.dev.br",
  updatedAt: "12 de novembro de 2026",
}

export const LEGAL_PATHS = ["/termos", "/privacidade"]
