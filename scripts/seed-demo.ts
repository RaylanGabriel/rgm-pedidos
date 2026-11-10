/**
 * Preenche uma loja com o cardápio de demonstração (categorias, itens e ilustrações no Vercel Blob).
 *
 * Uso:
 *   npm run demo:seed -- --store mr-smash [--cover | --only-cover]
 *
 * --cover       também coloca uma capa ilustrada na loja (troca a atual)
 * --only-cover  só coloca a capa (não mexe no cardápio)
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
import { categories, menuItemCategories, menuItems, stores } from "../db/schema"
import { cover } from "./demo-art"
import { DEMO_FEATURED, DEMO_MENU } from "./demo-menu"

const isOurBlob = (url: string | null) => !!url && URL.canParse(url) && new URL(url).hostname.endsWith(".public.blob.vercel-storage.com")

async function main() {
  const { values } = parseArgs({ options: {
      store: { type: "string" },
      cover: { type: "boolean", default: false },
      "only-cover": { type: "boolean", default: false },
    }, })
  if (!values.store) throw new Error("Informe --store <slug>")
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN ausente no .env.local")

  const [store] = await db.select().from(stores).where(eq(stores.slug, values.store)).limit(1)
  if (!store) throw new Error(`Loja "${values.store}" não encontrada`)

  const upload = async (svg: string, folder: string, width: number, height: number) => {
    const webp = await sharp(Buffer.from(svg)).resize(width, height).webp({ quality: 82 }).toBuffer()
    const blob = await put(`stores/${store.id}/${folder}/${randomUUID()}.webp`, webp, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    })
    return { url: blob.url, kb: Math.round(webp.length / 1024) }
  }

  const setCover = async () => {
    const c = await upload(cover(store.primaryColor), "cover", 1800, 560)
    await db.update(stores).set({ coverUrl: c.url }).where(eq(stores.id, store.id))
    if (isOurBlob(store.coverUrl)) await del(store.coverUrl!)
    console.log(`capa        ${c.kb} KB`)
  }
  if (values["only-cover"]) return setCover()

  // Categoria de destaque fica em primeiro; as do cardápio vêm depois
  const findCategory = (name: string) =>
    db
      .select()
      .from(categories)
      .where(and(eq(categories.storeId, store.id), eq(sql`lower(${categories.name})`, name.toLowerCase())))
      .limit(1)
      .then((r) => r[0])
  let featured = await findCategory(DEMO_FEATURED.name)
  if (featured) await db.update(categories).set({ sortOrder: 0 }).where(eq(categories.id, featured.id))
  else [featured] = await db.insert(categories).values({ storeId: store.id, name: DEMO_FEATURED.name, sortOrder: 0 }).returning()

  for (const [i, cat] of DEMO_MENU.entries()) {
    const ci = i + 1
    let [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.storeId, store.id), eq(sql`lower(${categories.name})`, cat.name.toLowerCase())))
      .limit(1)
    if (category) await db.update(categories).set({ sortOrder: ci, extrasEnabled: cat.extras }).where(eq(categories.id, category.id))
    else [category] = await db.insert(categories).values({ storeId: store.id, name: cat.name, sortOrder: ci, extrasEnabled: cat.extras }).returning()

    for (const [ii, item] of cat.items.entries()) {
      const blob = await upload(item.svg(), "items", 1000, 750)

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
      console.log(`${existing ? "atualizado" : "criado   "}  ${cat.name} › ${item.name} (${blob.kb} KB)`)
    }
  }

  // Itens de destaque (também aparecem em "Mais pedidos")
  for (const name of DEMO_FEATURED.items) {
    const [item] = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.storeId, store.id), eq(menuItems.name, name)))
      .limit(1)
    if (item) await db.insert(menuItemCategories).values({ menuItemId: item.id, categoryId: featured.id }).onConflictDoNothing()
  }
  console.log(`destaque    ${DEMO_FEATURED.name}: ${DEMO_FEATURED.items.join(", ")}`)

  if (values.cover) await setCover()
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err)
  process.exit(1)
})
