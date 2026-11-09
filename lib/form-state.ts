import { z } from "zod"

/** Estado devolvido pelas server actions de formulário do painel. */
export type FormState = {
  ok?: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string | undefined>
}

export function zodErrorState(error: z.ZodError): FormState {
  const f = error.flatten().fieldErrors as Record<string, string[] | undefined>
  return {
    error: "Verifique os campos destacados.",
    fieldErrors: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.[0]])),
  }
}

export const formText = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim()

/** Preço digitado pelo usuário ("18,90", "R$ 18.90", "18") → string "18.90" para o banco. */
export const priceSchema = z
  .string()
  .transform((v) => v.replace(/R\$\s?/i, "").replace(/\s/g, "").replace(",", "."))
  .pipe(
    z
      .string()
      .regex(/^\d{1,4}(\.\d{1,2})?$/, "Preço inválido (ex.: 18,90)")
      .transform((v) => Number(v).toFixed(2)),
  )

/** Campo opcional: vazio vira null. */
export const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.union([z.literal("").transform(() => null), schema]))

/** URL de imagem: https://... ou caminho do próprio site (/logo.png). */
export const imageUrlSchema = z
  .string()
  .max(500, "Endereço muito longo")
  .refine((v) => v.startsWith("/") || /^https:\/\/[^\s]+$/.test(v), "Use um endereço https:// ou /arquivo.png")
