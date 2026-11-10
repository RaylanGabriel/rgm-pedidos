import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * Schema multi-loja (multi-tenant).
 * Regra de ouro: toda tabela de negócio carrega `store_id` e toda consulta filtra por ele.
 */

// ---------- Enums ----------
export const orderStatus = pgEnum("order_status", [
  "pending", // recebido, aguardando confirmação
  "preparing",
  "ready",
  "delivered",
  "cancelled",
])

export const orderType = pgEnum("order_type", ["pickup", "delivery", "dine_in"])

export const paymentMethod = pgEnum("payment_method", ["pix", "cash", "card_on_delivery"])

export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "refunded"])

export const memberRole = pgEnum("member_role", ["owner", "staff"])

export const deliveryPricing = pgEnum("delivery_pricing", [
  "fixed", // mesma taxa para qualquer endereço
  "zones", // taxa por bairro (tabela delivery_zones)
])

// ---------- Plataforma ----------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    isSuperadmin: boolean("is_superadmin").notNull().default(false), // você, dono da plataforma
    mustChangePassword: boolean("must_change_password").notNull().default(false), // senha provisória
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
)

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(), // /loja/<slug>
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"), // capa do topo do cardápio
    primaryColor: text("primary_color").notNull().default("#f97316"),
    phone: text("phone"),
    address: text("address"), // endereço para retirada (mostrado ao cliente)
    isOpen: boolean("is_open").notNull().default(true), // dono abre/fecha a loja
    active: boolean("active").notNull().default(true), // plataforma suspende (inadimplência)
    suspendedReason: text("suspended_reason"), // mensagem mostrada ao dono/equipe quando suspensa
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    avgPrepMinutes: integer("avg_prep_minutes").notNull().default(15),
    nextOrderNumber: integer("next_order_number").notNull().default(1), // contador por loja
    // Entrega (a taxa é sempre calculada em create_order, nunca vem do navegador)
    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    deliveryPricing: deliveryPricing("delivery_pricing").notNull().default("fixed"),
    deliveryFixedFee: numeric("delivery_fixed_fee", { precision: 10, scale: 2 }).notNull().default("0"),
    deliveryMinOrder: numeric("delivery_min_order", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stores_slug_unique").on(t.slug)],
)

export const storeMembers = pgTable(
  "store_members",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("owner"),
  },
  (t) => [uniqueIndex("store_members_pk").on(t.userId, t.storeId), index("store_members_store_idx").on(t.storeId)],
)

/** Sessões de login. O cookie guarda um token aleatório; aqui fica só o hash SHA-256 dele. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token) em hex
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeStoreId: uuid("active_store_id").references(() => stores.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
)

/** Tentativas de login com falha, para limitar força bruta (por e-mail e por IP). */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(), // "email:fulano@x.com" ou "ip:1.2.3.4"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_key_created_idx").on(t.key, t.createdAt)],
)

// ---------- Cardápio ----------
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    extrasEnabled: boolean("extras_enabled").notNull().default(true), // bebidas/sobremesas: sem adicionais
  },
  (t) => [index("categories_store_idx").on(t.storeId)],
)

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true), // visível no cardápio
    available: boolean("available").notNull().default(true), // "acabou" hoje
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menu_items_store_idx").on(t.storeId)],
)

/** Adicionais/ingredientes extras (bacon, cheddar...). */
/**
 * Categorias extras de um item ("Mais vendidos", "Vegetarianos"…), além da principal (menu_items.category_id).
 * A principal decide os adicionais e onde o item fica no painel; aqui ele só aparece também em outras seções.
 */
export const menuItemCategories = pgTable(
  "menu_item_categories",
  {
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0), // ordem do item dentro dessa categoria
  },
  (t) => [uniqueIndex("menu_item_categories_pk").on(t.menuItemId, t.categoryId), index("menu_item_categories_cat_idx").on(t.categoryId)],
)

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    groupName: text("group_name").notNull().default("Adicionais"), // ex.: Proteína, Queijo, Molho
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ingredients_store_idx").on(t.storeId)],
)

// ---------- Entrega ----------
/** Bairros atendidos e a taxa de cada um (quando stores.delivery_pricing = 'zones'). */
export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fee: numeric("fee", { precision: 10, scale: 2 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("delivery_zones_store_name_unique").on(t.storeId, sql`lower(${t.name})`)],
)

// ---------- Pedidos ----------
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderNumber: integer("order_number").notNull(), // sequencial por loja
    publicToken: text("public_token").notNull(), // token aleatório p/ o cliente acompanhar (não adivinhável)
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    type: orderType("type").notNull().default("pickup"),
    deliveryAddress: text("delivery_address"),
    deliveryZoneName: text("delivery_zone_name"), // bairro no momento do pedido (cópia)
    status: orderStatus("status").notNull().default("pending"),
    paymentMethod: paymentMethod("payment_method").notNull().default("pix"),
    paymentStatus: paymentStatus("payment_status").notNull().default("pending"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    estimatedWaitMinutes: integer("estimated_wait_minutes").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_store_number_unique").on(t.storeId, t.orderNumber),
    uniqueIndex("orders_public_token_unique").on(t.publicToken),
    index("orders_store_status_created_idx").on(t.storeId, t.status, t.createdAt),
  ],
)

/** Guarda "foto" do nome/preço no momento da compra: mudar o cardápio depois não altera pedidos antigos. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
)

export const orderItemIngredients = pgTable(
  "order_item_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [index("order_item_ingredients_item_idx").on(t.orderItemId)],
)

// ---------- Relações (para db.query.*) ----------
export const storesRelations = relations(stores, ({ many }) => ({
  members: many(storeMembers),
  categories: many(categories),
  menuItems: many(menuItems),
  ingredients: many(ingredients),
  orders: many(orders),
}))

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  store: one(stores, { fields: [menuItems.storeId], references: [stores.id] }),
  category: one(categories, { fields: [menuItems.categoryId], references: [categories.id] }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  menuItem: one(menuItems, { fields: [orderItems.menuItemId], references: [menuItems.id] }),
  extras: many(orderItemIngredients),
}))

export const orderItemIngredientsRelations = relations(orderItemIngredients, ({ one }) => ({
  orderItem: one(orderItems, { fields: [orderItemIngredients.orderItemId], references: [orderItems.id] }),
  ingredient: one(ingredients, { fields: [orderItemIngredients.ingredientId], references: [ingredients.id] }),
}))
