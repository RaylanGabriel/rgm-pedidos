/** Formatação do estoque — serve no servidor e no navegador (sem acesso ao banco). */

export const UNIT_LABEL: Record<string, string> = { un: "unidade", fatia: "fatia", g: "grama", kg: "quilo", ml: "ml", L: "litro" }

/** Quantidade para mostrar: até 3 casas, vírgula, sem zeros à toa ("2,5", "100"). */
export const fmtQty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })

/** Para preencher um campo: SEM separador de milhar ("1500", "2,5"); senão "1.500" voltaria como 1,5 ao salvar. */
export const fmtInput = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false })

/**
 * Quantidade digitada → número ≥ 0, null (vazio) ou undefined (inválido). Aceita o jeito brasileiro:
 * "1.500" = mil e quinhentos, "1.500,5", "2,5"; e também "2.5".
 */
export function parseQty(raw: string): number | null | undefined {
  let t = raw.replace(/\s/g, "")
  if (!t) return null
  if (/^\d{1,3}(\.\d{3})+(,\d{1,3})?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".")
  else t = t.replace(",", ".")
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return undefined
  const n = Number(t)
  return n <= 1_000_000 ? n : undefined
}
