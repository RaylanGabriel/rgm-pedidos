/**
 * Loja de demonstração para um possível cliente, a partir de um arquivo de texto.
 *
 *   npm run demo:loja -- criar demos/dogaodoze.txt      cria a loja (no site no ar)
 *   npm run demo:loja -- listar                          lista as demos e há quantos dias existem
 *   npm run demo:loja -- cliente dogaodoze --email dono@x.com --nome "José"   vira cliente de verdade
 *   npm run demo:loja -- apagar dogaodoze                apaga a demo (loja, cardápio e imagens)
 *
 * Para testar no banco de testes em vez do site no ar: npm run demo:loja:teste -- …
 * Modelo do arquivo: scripts/demo-exemplo.txt
 */
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { del, put } from "@vercel/blob"
import { count, eq, inArray, sql } from "drizzle-orm"
import QRCode from "qrcode"
import sharp from "sharp"
import { db } from "../db"
import { categories, menuItemCategories, menuItems, orders, storeMembers, stores, users } from "../db/schema"
import { generateTempPassword, hashPassword } from "../lib/auth/password"
import { isReservedSlug } from "../lib/domains"
import { parseFacebook, parseInstagram } from "../lib/links"
import { SLUG_RE, slugify } from "../lib/slug"
import * as art from "./demo-art"

const DOMAIN = process.env.ROOT_DOMAIN || "rgm.dev.br"
const isOurBlob = (url: string | null) => !!url && URL.canParse(url) && new URL(url).hostname.endsWith(".public.blob.vercel-storage.com")
let PRODUCAO = false // npm run demo:loja (site no ar) passa --producao; demo:loja:teste não
const ambiente = () => (PRODUCAO ? "SITE NO AR (produção)" : "banco de TESTES")

// ---------- Arquivo da demo ----------
type Item = { name: string; price: string; description: string | null; featured: boolean }
type Category = { name: string; items: Item[] }
type DemoFile = {
  nome: string
  slug: string
  cor: string
  whatsapp: string | null
  instagram: string | null
  facebook: string | null
  endereco: string | null
  entrega: string | null
  logo: string | null
  menu: Category[]
}

/** "22,90" | "R$ 22.90" | "22" → "22.90" */
function price(raw: string, line: number) {
  const v = raw.replace(/R\$\s*/i, "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(v)) throw new Error(`Linha ${line}: preço inválido "${raw}" (use 22,90)`)
  return Number(v).toFixed(2)
}

function readDemoFile(path: string): DemoFile {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "")
  const meta: Record<string, string> = {}
  const menu: Category[] = []
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim()
    const n = i + 1
    if (!line || line.startsWith("//")) return
    if (line.startsWith("#")) {
      menu.push({ name: line.replace(/^#+/, "").trim(), items: [] })
      return
    }
    const kv = !menu.length && line.match(/^([a-zçãé]+)\s*:\s*(.*)$/i)
    if (kv) {
      meta[kv[1].toLowerCase()] = kv[2].trim()
      return
    }
    if (!menu.length) throw new Error(`Linha ${n}: item antes de qualquer categoria. Comece a categoria com "# Lanches".`)
    // "Nome | 22,90 | descrição" ou "Nome - 22,90 - descrição"
    const parts = line.includes("|") ? line.split("|") : line.split(/\s+-\s+/)
    if (parts.length < 2) throw new Error(`Linha ${n}: use "Nome | preço | descrição" (o preço é obrigatório)`)
    let name = parts[0].trim()
    const featured = name.startsWith("*")
    if (featured) name = name.slice(1).trim()
    menu.at(-1)!.items.push({ name, price: price(parts[1].trim(), n), description: parts.slice(2).join(" - ").trim() || null, featured })
  })
  if (!meta.nome) throw new Error('Falta a linha "nome: Nome da Loja"')
  const slug = (meta.slug || slugify(meta.nome)).toLowerCase()
  if (!SLUG_RE.test(slug)) throw new Error(`Endereço inválido "${slug}" (só letras minúsculas, números e hífen)`)
  if (isReservedSlug(slug)) throw new Error(`"${slug}" é reservado; escolha outro endereço`)
  const cor = meta.cor || "#c2410c"
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw new Error(`Cor inválida "${cor}" (use #rrggbb)`)
  if (!menu.some((c) => c.items.length)) throw new Error("O cardápio está vazio")
  const insta = meta.instagram ? parseInstagram(meta.instagram) : undefined
  const face = meta.facebook ? parseFacebook(meta.facebook) : undefined
  if (insta === null) throw new Error(`Instagram inválido "${meta.instagram}"`)
  if (face === null) throw new Error(`Facebook inválido "${meta.facebook}"`)
  const phone = meta.whatsapp ? meta.whatsapp.replace(/\D/g, "") : null
  if (phone && (phone.length < 10 || phone.length > 13)) throw new Error(`WhatsApp inválido "${meta.whatsapp}" (com DDD)`)
  return {
    nome: meta.nome,
    slug,
    cor: cor.toLowerCase(),
    whatsapp: phone,
    instagram: insta ?? null,
    facebook: face ?? null,
    endereco: meta.endereco || null,
    entrega: meta.entrega ? price(meta.entrega, 0) : null,
    logo: meta.logo ? resolve(dirname(path), meta.logo) : null,
    menu,
  }
}

// ---------- Ilustração pelo nome do item ----------
const COLA = { body: "#b71c1c", band: "#e53935", label: "COLA" }
const GUARANA = { body: "#1b5e20", band: "#2e7d32", label: "GUARANÁ" }
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/** Escolhe uma ilustração pelo nome (e categoria). Sem correspondência boa: sem imagem (melhor que uma errada). */
function pickArt(itemName: string, categoryName: string): string | null {
  const n = norm(itemName)
  const c = norm(categoryName)
  const has = (...w: string[]) => w.some((x) => n.includes(x))
  const burgerSpec = (): art.BurgerSpec => ({
    patties: has("triplo") ? 3 : has("duplo", "double") ? 2 : 1,
    cheese: has("triplo") ? 3 : has("duplo") ? 2 : 1,
    bacon: has("bacon"),
    lettuce: has("salada", "tudo", "completo"),
    tomato: has("salada", "tudo", "completo"),
    chicken: has("frango", "chicken", "crispy"),
    onion: has("cebola", "onion") ? "caramel" : undefined,
  })
  if (has("combo") || c.includes("combo")) return art.combo(burgerSpec(), has("guarana") ? GUARANA : COLA)
  if (has("milk", "shake")) return art.milkshake(has("chocolate", "ovomaltine", "nutella") ? "#7b4a2d" : has("acai") ? "#5b2a6e" : "#f38aa9", "#fff7f0")
  if (has("acai")) return art.milkshake("#5b2a6e", "#e9d7f0")
  if (has("brownie", "sorvete", "pudim", "bolo", "doce")) return art.brownie()
  if (has("suco", "laranja", "limonada")) return art.juice("#f8961e", "#ffc971", "#f3722c")
  if (has("agua")) return art.water()
  if (has("guarana")) return art.can(GUARANA.body, GUARANA.band, GUARANA.label, ["#e3f6dc", "#7cc46a"])
  if (has("coca", "cola", "pepsi")) return art.can(COLA.body, COLA.band, COLA.label, ["#ffe0e0", "#ef6f6f"])
  if (has("fanta", "laranjinha")) return art.can("#ef6c00", "#ff9800", "LARANJA", ["#fff1dc", "#f6a54b"])
  if (has("refri", "lata", "soda", "sprite")) return art.can("#1565c0", "#1e88e5", "REFRI", ["#e3f0ff", "#7fb2ef"])
  if (has("batata", "fritas", "fries")) return art.fries({ cheddar: has("cheddar"), bacon: has("bacon") })
  if (has("onion", "anel", "aneis", "cebola empanada")) return art.onionRings()
  if (has("nugget", "frango frito", "isca")) return art.nuggets()
  const isBurgerCategory = /lanche|burger|hamburg|smash|sanduiche|x-/.test(c)
  if (has("burger", "burguer", "x-", "x ", "smash", "hamburg", "cheese", "sanduiche") || (isBurgerCategory && !has("dog", "pastel", "pizza", "porcao"))) return art.burger(burgerSpec())
  return null
}

const extrasFor = (categoryName: string) => !/bebida|refri|suco|sobremesa|doce|sorvete|açaí|acai|milk/i.test(categoryName)

async function uploadSvg(storeId: string, svg: string, folder: string, width: number, height: number) {
  const webp = await sharp(Buffer.from(svg)).resize(width, height).webp({ quality: 82 }).toBuffer()
  const blob = await put(`stores/${storeId}/${folder}/${randomUUID()}.webp`, webp, {
    access: "public",
    contentType: "image/webp",
    addRandomSuffix: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  })
  return blob.url
}

// ---------- Comandos ----------
async function criar(path: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN ausente no .env.local")
  const d = readDemoFile(path)
  if (d.logo && !existsSync(d.logo)) throw new Error(`Logo não encontrada: ${d.logo}`)
  const [taken] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, d.slug)).limit(1)
  if (taken) throw new Error(`O endereço "${d.slug}" já existe. Escolha outro (linha "slug:") ou apague a demo antiga.`)

  console.log(`\nCriando "${d.nome}" no ${ambiente()}…`)
  const storeId = randomUUID()
  await db.insert(stores).values({
    id: storeId,
    slug: d.slug,
    name: d.nome,
    primaryColor: d.cor,
    phone: d.whatsapp,
    instagram: d.instagram,
    facebook: d.facebook,
    address: d.endereco,
    isDemo: true,
    isOpen: true,
    deliveryEnabled: d.entrega !== null,
    deliveryPricing: "fixed",
    deliveryFixedFee: d.entrega ?? "0",
  })

  try {
    const coverUrl = await uploadSvg(storeId, art.cover(d.cor), "cover", 1800, 560)
    let logoUrl: string | null = null
    if (d.logo) {
      const webp = await sharp(readFileSync(d.logo)).resize(512, 512, { fit: "contain", background: "#ffffff" }).webp({ quality: 85 }).toBuffer()
      logoUrl = (await put(`stores/${storeId}/logo/${randomUUID()}.webp`, webp, { access: "public", contentType: "image/webp", addRandomSuffix: false })).url
    }
    await db.update(stores).set({ coverUrl, logoUrl }).where(eq(stores.id, storeId))

    const featured = d.menu.flatMap((c) => c.items).filter((i) => i.featured)
    let featuredId: string | null = null
    if (featured.length) {
      ;[{ id: featuredId }] = await db.insert(categories).values({ storeId, name: "⭐ Mais pedidos", sortOrder: 0 }).returning({ id: categories.id })
    }
    let total = 0
    let withArt = 0
    for (const [ci, cat] of d.menu.entries()) {
      if (!cat.items.length) continue
      const [category] = await db
        .insert(categories)
        .values({ storeId, name: cat.name, sortOrder: ci + 1, extrasEnabled: extrasFor(cat.name) })
        .returning({ id: categories.id })
      for (const [ii, item] of cat.items.entries()) {
        const svg = pickArt(item.name, cat.name)
        const imageUrl = svg ? await uploadSvg(storeId, svg, "items", 1000, 750) : null
        const [mi] = await db
          .insert(menuItems)
          .values({ storeId, categoryId: category.id, name: item.name, description: item.description, price: item.price, imageUrl, sortOrder: ii })
          .returning({ id: menuItems.id })
        if (item.featured && featuredId) await db.insert(menuItemCategories).values({ menuItemId: mi.id, categoryId: featuredId })
        total++
        if (svg) withArt++
        console.log(`  ${svg ? "🖼" : "  "}  ${cat.name} › ${item.name} — R$ ${item.price.replace(".", ",")}`)
      }
    }

    const url = `https://${d.slug}.${DOMAIN}`
    mkdirSync("demos", { recursive: true })
    const qrPath = join("demos", `${d.slug}-qrcode.png`)
    await QRCode.toFile(qrPath, url, { width: 800, margin: 2, errorCorrectionLevel: "M" })
    const msg = `Oi! Montei um exemplo do cardápio da ${d.nome} com pedido online e Pix: ${url} — dá uma olhada no celular!`
    console.log(`\n✅ Pronto: ${total} itens (${withArt} com ilustração)${featured.length ? `, ${featured.length} em "⭐ Mais pedidos"` : ""}.`)
    console.log(`   Link:    ${url}`)
    console.log(`   QR code: ${resolve(qrPath)}`)
    console.log(`   Mandar no WhatsApp: https://wa.me/${d.whatsapp ? (d.whatsapp.startsWith("55") ? d.whatsapp : "55" + d.whatsapp) : ""}?text=${encodeURIComponent(msg)}`)
    console.log(`\n   Itens sem ilustração mostram só o nome e o preço (troque pelas fotos reais quando virar cliente).`)
    console.log(`   Para ver a cozinha da demo: painel → Lojas → "Entrar" na ${d.nome}.\n`)
  } catch (err) {
    // Deu errado no meio: não deixa loja pela metade
    await removeStore(storeId)
    throw err
  }
}

async function removeStore(storeId: string) {
  const [s] = await db.select({ logoUrl: stores.logoUrl, coverUrl: stores.coverUrl }).from(stores).where(eq(stores.id, storeId)).limit(1)
  const items = await db.select({ imageUrl: menuItems.imageUrl }).from(menuItems).where(eq(menuItems.storeId, storeId))
  const urls = [s?.logoUrl ?? null, s?.coverUrl ?? null, ...items.map((i) => i.imageUrl)].filter(isOurBlob) as string[]
  await db.delete(stores).where(eq(stores.id, storeId)) // cardápio, pedidos e vínculos saem junto (cascade)
  if (urls.length) await del(urls).catch(() => {})
  return urls.length
}

async function demoBySlug(slug: string) {
  const [s] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1)
  if (!s) throw new Error(`Loja "${slug}" não encontrada no ${ambiente()}`)
  if (!s.isDemo) throw new Error(`"${slug}" não é uma demo (é loja de cliente). Nada foi feito.`)
  return s
}

async function listar() {
  const demos = await db
    .select({ id: stores.id, slug: stores.slug, name: stores.name, createdAt: stores.createdAt })
    .from(stores)
    .where(eq(stores.isDemo, true))
    .orderBy(stores.createdAt)
  console.log(`\nDemos no ${ambiente()}: ${demos.length}`)
  if (!demos.length) return
  const counts = await db
    .select({ storeId: orders.storeId, n: count() })
    .from(orders)
    .where(inArray(orders.storeId, demos.map((d) => d.id)))
    .groupBy(orders.storeId)
  for (const d of demos) {
    const days = Math.floor((Date.now() - d.createdAt.getTime()) / 86400_000)
    const n = counts.find((c) => c.storeId === d.id)?.n ?? 0
    console.log(`  ${d.name.padEnd(28)} https://${d.slug}.${DOMAIN}   ${days === 0 ? "hoje" : `há ${days} dia(s)`}   ${n} pedido(s) de teste`)
  }
  console.log()
}

async function cliente(slug: string, email: string | undefined, nome: string | undefined) {
  if (!email || !nome) throw new Error('Informe --email e --nome do dono. Ex.: cliente dogaodoze --email dono@x.com --nome "José"')
  const s = await demoBySlug(slug)
  const mail = email.trim().toLowerCase()
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, mail)).limit(1)
  const userId = existing?.id ?? randomUUID()
  const temp = existing ? null : generateTempPassword()
  if (temp) {
    await db.insert(users).values({ id: userId, email: mail, name: nome.trim(), passwordHash: await hashPassword(temp), mustChangePassword: true })
  }
  await db.batch([
    db.insert(storeMembers).values({ userId, storeId: s.id, role: "owner" }).onConflictDoNothing(),
    // Pedidos de teste da demonstração não entram nos relatórios do cliente
    db.delete(orders).where(eq(orders.storeId, s.id)),
    db.update(stores).set({ isDemo: false, nextOrderNumber: 1 }).where(eq(stores.id, s.id)),
  ])
  console.log(`\n✅ "${s.name}" agora é loja de cliente (pedidos de teste apagados, numeração recomeça do #1).`)
  console.log(`   Painel: https://painel.${DOMAIN}   E-mail: ${mail}`)
  if (temp) console.log(`   Senha provisória (mostrada só agora; ele troca no 1º acesso): ${temp}`)
  else console.log("   Esse e-mail já tinha conta: entra com a senha que já usa.")
  console.log("   Próximos passos: trocar as ilustrações pelas fotos reais, horários, entrega e Mercado Pago.\n")
}

async function apagar(slug: string) {
  const s = await demoBySlug(slug)
  const n = await removeStore(s.id)
  console.log(`\n🗑  Demo "${s.name}" apagada (${n} imagem(ns) removida(s)).\n`)
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { email: { type: "string" }, nome: { type: "string" }, producao: { type: "boolean", default: false } },
  })
  PRODUCAO = values.producao
  const [cmd, arg] = positionals
  if (cmd === "criar" && arg) return criar(arg)
  if (cmd === "listar") return listar()
  if (cmd === "cliente" && arg) return cliente(arg, values.email, values.nome)
  if (cmd === "apagar" && arg) return apagar(arg)
  console.log(`Uso:
  npm run demo:loja -- criar demos/<arquivo>.txt
  npm run demo:loja -- listar
  npm run demo:loja -- cliente <slug> --email dono@x.com --nome "Nome do dono"
  npm run demo:loja -- apagar <slug>
(demo:loja:teste = mesmo, no banco de testes). Modelo do arquivo: scripts/demo-exemplo.txt`)
}

// exitCode em vez de process.exit(): no Windows o exit forçado com conexões abertas dispara um "Assertion failed" do Node
main().catch((err) => {
  console.error("\n❌", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
