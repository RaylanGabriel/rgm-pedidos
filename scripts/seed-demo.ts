/**
 * Preenche uma loja com o cardápio de demonstração (categorias, itens e ilustrações no Vercel Blob).
 *
 * Uso:
 *   npm run demo:seed -- --store mr-smash
 *
 * - Categorias e itens são encontrados pelo nome: os que já existem são atualizados (descrição, preço,
 *   ordem e imagem), os que faltam são criados. Nada é apagado.
 * - A imagem antiga do item (se estiver no nosso Blob) é apagada ao trocar.
 */
import { randomUUID } from "node:crypto"
import { parseArgs } from "node:util"
import { del, put } from "@vercel/blob"
import { and, eq, sql } from "drizzle-orm"
import sharp from "sharp"
import { db } from "../db"
import { categories, menuItems, stores } from "../db/schema"
import { DEMO_MENU } from "./demo-menu"

const isOurBlob = (url: string | null) => !!url && URL.canParse(url) && new URL(url).hostname.endsWith(".public.blob.vercel-storage.com")

async function main() {
  const { values } = parseArgs({ options: { store: { type: "string" } } })
  if (!values.store) throw new Error("Informe --store <slug>")
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN ausente no .env.local")

  const [store] = await db.select().from(stores).where(eq(stores.slug, values.store)).limit(1)
  if (!store) throw new Error(`Loja "${values.store}" não encontrada`)

  for (const [ci, cat] of DEMO_MENU.entries()) {
    let [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.storeId, store.id), eq(sql`lower(${categories.name})`, cat.name.toLowerCase())))
      .limit(1)
    if (category) await db.update(categories).set({ sortOrder: ci, extrasEnabled: cat.extras }).where(eq(categories.id, category.id))
    else [category] = await db.insert(categories).values({ storeId: store.id, name: cat.name, sortOrder: ci, extrasEnabled: cat.extras }).returning()

    for (const [ii, item] of cat.items.entries()) {
      const webp = await sharp(Buffer.from(item.svg())).resize(1000, 750).webp({ quality: 82 }).toBuffer()
      const blob = await put(`stores/${store.id}/items/${randomUUID()}.webp`, webp, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      })

      const values = {
        categoryId: category.id,
        description: item.description,
        price: item.price,
        imageUrl: blob.url,
        sortOrder: ii,
        active: true,
        available: true,
      }
      const [existing] = await db
        .select({ id: menuItems.id, imageUrl: menuItems.imageUrl })
        .from(menuItems)
        .where(and(eq(menuItems.storeId, store.id), eq(sql`lower(${menuItems.name})`, item.name.toLowerCase())))
        .limit(1)
      if (existing) {
        await db.update(menuItems).set(values).where(eq(menuItems.id, existing.id))
        if (isOurBlob(existing.imageUrl)) await del(existing.imageUrl!)
      } else {
        await db.insert(menuItems).values({ ...values, storeId: store.id, name: item.name })
      }
      console.log(`${existing ? "atualizado" : "criado   "}  ${cat.name} › ${item.name} (${Math.round(webp.length / 1024)} KB)`)
    }
  }
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err)
  process.exit(1)
})
