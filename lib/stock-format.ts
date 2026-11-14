/** Formatação do estoque — serve no servidor e no navegador (sem acesso ao banco). */

export const UNIT_LABEL: Record<string, string> = { un: "unidade", fatia: "fatia", g: "grama", kg: "quilo", ml: "ml", L: "litro" }

/** Quantidade para mostrar: até 3 casas, vírgula, sem zeros à toa ("2,5", "100"). */
export const fmtQty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
