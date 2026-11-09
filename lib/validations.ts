import { z } from "zod"

// Sanitiza strings removendo tags HTML e caracteres perigosos
export function sanitizeString(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // Remove tags HTML
    .replace(/[<>'"&]/g, "") // Remove caracteres perigosos
    .trim()
}

// Schema para login
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email é obrigatório")
    .email("Email inválido")
    .max(255, "Email muito longo")
    .transform((val) => val.toLowerCase().trim()),
  // No login só exigimos que exista; a regra de força vale na criação (newPasswordSchema)
  password: z.string().min(1, "Senha é obrigatória").max(128, "Senha muito longa"),
})

// Schema para criar/trocar senha
export const newPasswordSchema = z
  .string()
  .min(8, "Senha deve ter no mínimo 8 caracteres")
  .max(128, "Senha muito longa")

// Schema para nome do cliente
export const customerNameSchema = z
  .string()
  .min(2, "Nome deve ter no mínimo 2 caracteres")
  .max(100, "Nome muito longo")
  .transform(sanitizeString)

// Schema para observações do pedido
export const notesSchema = z
  .string()
  .max(500, "Observações muito longas")
  .transform(sanitizeString)
  .optional()

// Schema para finalizar pedido
export const checkoutSchema = z.object({
  customerName: customerNameSchema,
  notes: notesSchema,
})

// Schema para número do pedido (para acompanhamento)
export const orderNumberSchema = z
  .string()
  .regex(/^[A-Z0-9]+$/, "Número do pedido inválido")
  .min(1, "Número do pedido é obrigatório")
  .max(20, "Número do pedido inválido")

// Tipos inferidos
export type LoginInput = z.infer<typeof loginSchema>
export type CheckoutInput = z.infer<typeof checkoutSchema>
