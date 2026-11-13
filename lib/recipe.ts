/*
 * Botões "sem ___" de cada lanche, tirados da descrição que o dono já escreve para o cliente.
 * Usado no painel (chips ao editar o lanche) e no servidor (preencher todos de uma vez).
 */

/** Chave para comparar nomes: "  Queijo  Cheddar" e "queijo cheddar" são o mesmo ingrediente. */
export const nameKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()

/**
 * "Blend de carne 120g, queijo cheddar, alface e tomate. Para quem tem fome" →
 * ["Blend de carne 120g", "Queijo cheddar", "Alface", "Tomate", "Para quem tem fome"]
 */
export function descriptionParts(text: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of (text ?? "").split(/[,;\n]+|\.\s+|\s+e\s+/i)) {
    const p = raw.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").trim()
    const key = nameKey(p)
    if (p.length < 2 || p.length > 60 || seen.has(key)) continue
    seen.add(key)
    out.push(p[0].toUpperCase() + p.slice(1))
  }
  return out.slice(0, 30)
}

/**
 * Sugestão do que o cliente pode tirar: ingrediente curto, sem medida ("Cebola", "Molho barbecue").
 * Fica de fora o que tem número ("Blend de carne 120g", "Lata 350ml") e frases ("Para quem tem fome de verdade").
 * O dono confere e muda no painel.
 */
export const suggestRemovable = (part: string) => !/\d/.test(part) && part.split(" ").length <= 3

/**
 * Lanches que o "Preencher pela descrição" vai preencher: ainda sem botões "sem ___", em categoria com adicionais
 * (ou sem categoria) e com alguma sugestão na descrição. Bebidas e sobremesas ficam de fora.
 */
export function pendingRemovable(
  items: { id: string; description: string | null; categoryId: string | null }[],
  categories: { id: string; extrasEnabled: boolean }[],
  withButtons: string[],
) {
  const extras = new Map(categories.map((c) => [c.id, c.extrasEnabled]))
  const done = new Set(withButtons)
  return items.flatMap((i) => {
    if (done.has(i.id) || (i.categoryId && !extras.get(i.categoryId))) return []
    const names = descriptionParts(i.description).filter(suggestRemovable)
    return names.length ? [{ id: i.id, names }] : []
  })
}
