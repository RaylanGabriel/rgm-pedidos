/** Utilitários da cor da loja (formato #rrggbb). */
import type { CSSProperties } from "react"

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

/** Luminância relativa (WCAG) de uma cor #rrggbb. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** Texto que fica legível sobre a cor: branco ou quase-preto, o que tiver mais contraste. */
export function readableTextOn(hex: string) {
  const l = luminance(hex)
  return contrast(l, 1) >= contrast(l, luminance("#111111")) ? "#ffffff" : "#111111"
}

/** Contraste do texto escolhido sobre a cor (≥ 4.5 é o mínimo recomendado para texto normal). */
export function textContrast(hex: string) {
  const l = luminance(hex)
  return contrast(l, luminance(readableTextOn(hex)))
}

/** Variáveis CSS que trocam a cor principal do tema dentro de um elemento. */
export function brandStyle(hex: string | null | undefined): CSSProperties | undefined {
  if (!hex || !isHexColor(hex)) return undefined
  return {
    "--primary": hex,
    "--ring": hex,
    "--primary-foreground": readableTextOn(hex),
  } as CSSProperties
}
