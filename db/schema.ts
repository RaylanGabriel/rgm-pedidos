import { relations, sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
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
  "ready", // pronto (retirada: no balcão; entrega: aguardando o entregador)
  "out_for_delivery", // saiu para entrega (só pedidos de entrega)
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
  "distance", // taxa por distância em km (tabela delivery_distance_tiers + stores.location)
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
    instagram: text("instagram"), // só o usuário, sem @ (ex.: "mrsmash")
    facebook: text("facebook"), // caminho depois de facebook.com/ (ex.: "mrsmash" ou "profile.php?id=123")
    isOpen: boolean("is_open").notNull().default(true), // dono abre/fecha a loja (no automático: o ajuste manual)
    // Horário automático (lib/hours.ts): { "0": [["18:00","23:30"]], ... }; manual_until = até quando vale o "Fechar/Abrir agora"
    hoursEnabled: boolean("hours_enabled").notNull().default(false),
    openingHours: jsonb("opening_hours"),
    manualUntil: timestamp("manual_until", { withTimezone: true }),
    active: boolean("active").notNull().default(true), // plataforma suspende (inadimplência)
    isDemo: boolean("is_demo").notNull().default(false), // loja de demonstração para um possível cliente (npm run demo:loja)
    suspendedReason: text("suspended_reason"), // mensagem mostrada ao dono/equipe quando suspensa
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    avgPrepMinutes: integer("avg_prep_minutes").notNull().default(15),
    nextOrderNumber: integer("next_order_number").notNull().default(1), // contador por loja
    // Entrega (a taxa é sempre calculada em create_order, nunca vem do navegador)
    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    deliveryPricing: deliveryPricing("delivery_pricing").notNull().default("fixed"),
    deliveryFixedFee: numeric("delivery_fixed_fee", { precision: 10, scale: 2 }).notNull().default("0"),
    deliveryMinOrder: numeric("delivery_min_order", { precision: 10, scale: 2 }).notNull().default("0"),
    // Ponto da loja para a entrega por km: { lat, lng, label, city, state, source: "address" | "device" }
    location: jsonb("location"),
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

// ---------- Clientes (conta opcional, vale para todas as lojas) ----------
/**
 * Conta do cliente: entra com Google ou com código por e-mail (sem senha). Separada de `users` (equipe):
 * uma sessão de cliente nunca abre o painel. Pedir sem conta continua possível.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    googleSub: text("google_sub"), // id da conta Google (o "sub" do token), quando entrou com Google
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("customers_email_unique").on(sql`lower(${t.email})`), uniqueIndex("customers_google_sub_unique").on(t.googleSub)],
)

/** Sessões do cliente (cookie `csid` no domínio das lojas). Aqui fica só o sha256 do token. */
export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: text("id").primaryKey(), // sha256(token) em hex
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_sessions_customer_idx").on(t.customerId)],
)

/** Endereços salvos do cliente ("Casa", "Trabalho"…). Sem bairro de entrega da loja: isso é de cada loja. */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"), // "Casa", "Trabalho"
    cep: text("cep"),
    street: text("street").notNull(),
    number: text("number"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    complement: text("complement"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)],
)

/** Código de 6 dígitos mandado por e-mail para entrar. Só o sha256; vale 10 min e até 5 tentativas. */
export const customerLoginCodes = pgTable(
  "customer_login_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(), // já em minúsculas
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_login_codes_email_idx").on(t.email, t.createdAt)],
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

/**
 * Ingredientes da loja — um cadastro só para a ficha técnica dos lanches e para os adicionais.
 * - `isExtra`: também é vendido à parte como adicional (+ `price`). Base (pão, carne, cebola): false, preço 0.
 * - Usado na ficha técnica (menu_item_ingredients) e, no futuro, no controle de estoque.
 */
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
    isExtra: boolean("is_extra").notNull().default(true), // oferecido como adicional pago
    active: boolean("active").notNull().default(true),
    // Estoque (9b): só os ingredientes que o dono escolheu controlar
    trackStock: boolean("track_stock").notNull().default(false),
    unit: text("unit").notNull().default("un"), // un, g, kg, ml, L, fatia
    stock: numeric("stock", { precision: 12, scale: 3 }).notNull().default("0"), // saldo atual (pode ficar negativo)
    minStock: numeric("min_stock", { precision: 12, scale: 3 }), // abaixo disso: "acabando"
    extraAmount: numeric("extra_amount", { precision: 12, scale: 3 }).notNull().default("1"), // quanto 1 adicional gasta
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ingredients_store_idx").on(t.storeId)],
)

export const stockMovementKind = pgEnum("stock_movement_kind", ["order", "order_return", "purchase", "loss", "adjust"])

/**
 * Histórico do estoque: cada mudança de saldo é uma linha (o saldo em ingredients.stock muda na mesma operação).
 * order = pedido entrou na cozinha (negativo); order_return = pedido cancelado devolveu; purchase = entrada;
 * loss = perda (negativo); adjust = contagem/ajuste (a diferença, + ou −).
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    delta: numeric("delta", { precision: 12, scale: 3 }).notNull(),
    kind: stockMovementKind("kind").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    note: text("note"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_store_created_idx").on(t.storeId, t.createdAt),
    index("stock_movements_ingredient_created_idx").on(t.ingredientId, t.createdAt),
    index("stock_movements_order_idx").on(t.orderId),
  ],
)

/**
 * Ficha técnica: ingredientes que cada lanche leva. `removable`: o cliente pode pedir "sem" (pão e carne, não).
 * Os dois lados são da mesma loja (garantido nas ações do painel).
 */
export const menuItemIngredients = pgTable(
  "menu_item_ingredients",
  {
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    removable: boolean("removable").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0), // ordem dos botões "sem ___"
    quantity: numeric("quantity", { precision: 12, scale: 3 }), // estoque (9b): quanto 1 unidade do lanche gasta
  },
  (t) => [uniqueIndex("menu_item_ingredients_pk").on(t.menuItemId, t.ingredientId), index("menu_item_ingredients_ing_idx").on(t.ingredientId)],
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

/** Faixas da entrega por distância: "até X km → R$ Y" (quando stores.delivery_pricing = 'distance'). */
export const deliveryDistanceTiers = pgTable(
  "delivery_distance_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    upToKm: numeric("up_to_km", { precision: 5, scale: 1 }).notNull(),
    fee: numeric("fee", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("delivery_distance_tiers_store_km_unique").on(t.storeId, t.upToKm)],
)

/**
 * Endereços já localizados (OpenStreetMap/Nominatim), para não consultar de novo (limite de 1/s) e para o
 * servidor chegar na mesma distância do orçamento ao criar o pedido. A chave é um hash: não guarda o endereço.
 */
export const geocodeCache = pgTable("geocode_cache", {
  key: text("key").primaryKey(), // sha256 do endereço normalizado
  lat: doublePrecision("lat"), // null = não encontrado (evita repetir a consulta)
  lng: doublePrecision("lng"),
  precise: boolean("precise").notNull().default(false), // achou o número da casa (senão, o meio da rua)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Erros do servidor (instrumentation.ts → onRequestError, e falhas do cron). O cron manda um e-mail de alerta com os
 * que ainda não foram avisados (`alerted_at` nulo), no máximo 1 a cada 30 min, e apaga os com mais de 30 dias.
 * Fica fora do backup (lib/backup-tables.ts).
 */
export const errorEvents = pgTable(
  "error_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // "requisição" | "cron"
    path: text("path"), // rota (sem query string)
    message: text("message").notNull(), // resumida (até 500 caracteres)
    digest: text("digest"), // código que o Next mostra na tela de erro
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
  },
  (t) => [index("error_events_created_idx").on(t.createdAt), index("error_events_pending_idx").on(t.alertedAt)],
)

// ---------- Pedidos ----------
/**
 * Conta do Mercado Pago conectada pela loja (OAuth). Tokens criptografados (AES-256-GCM, lib/crypto.ts).
 * Uma conta por loja; o Pix do pedido cai direto na conta do dono.
 */
export const storePaymentAccounts = pgTable("store_payment_accounts", {
  storeId: uuid("store_id")
    .primaryKey()
    .references(() => stores.id, { onDelete: "cascade" }),
  mpUserId: text("mp_user_id").notNull(), // id do vendedor no Mercado Pago (chega nos webhooks)
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  liveMode: boolean("live_mode").notNull().default(false), // false = conta/credencial de teste
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
})

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
    // Conta do cliente que fez o pedido (opcional). Apagar a conta só desliga: o pedido mantém nome/telefone.
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    type: orderType("type").notNull().default("pickup"),
    deliveryAddress: text("delivery_address"),
    deliveryZoneName: text("delivery_zone_name"), // bairro no momento do pedido (cópia)
    deliveryDistanceKm: numeric("delivery_distance_km", { precision: 6, scale: 2 }), // entrega por km: distância calculada
    status: orderStatus("status").notNull().default("pending"),
    paymentMethod: paymentMethod("payment_method").notNull().default("pix"),
    paymentStatus: paymentStatus("payment_status").notNull().default("pending"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    changeFor: numeric("change_for", { precision: 10, scale: 2 }), // dinheiro: "troco para R$ ___"
    // Pix online (Mercado Pago da loja)
    mpOrderId: text("mp_order_id"), // id da order no Mercado Pago
    pixCode: text("pix_code"), // Pix copia e cola
    pixExpiresAt: timestamp("pix_expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    estimatedWaitMinutes: integer("estimated_wait_minutes").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    customerConfirmedAt: timestamp("customer_confirmed_at", { withTimezone: true }), // cliente tocou "Recebi meu pedido"
    readyAt: timestamp("ready_at", { withTimezone: true }), // quando a cozinha marcou "pronto" (tempo de preparo)
    outForDeliveryAt: timestamp("out_for_delivery_at", { withTimezone: true }), // quando saiu para entrega
    autoDelivered: boolean("auto_delivered").notNull().default(false), // fechado sozinho 1h depois de sair
    // Estoque (9b): quando o pedido descontou os ingredientes (entrou na cozinha) e quando devolveu (cancelado)
    stockAppliedAt: timestamp("stock_applied_at", { withTimezone: true }),
    stockReturnedAt: timestamp("stock_returned_at", { withTimezone: true }),
    // Chave de cada tentativa de "Confirmar pedido" (gerada no navegador): repetir a mesma tentativa — resposta perdida,
    // toque duplo — devolve o pedido já criado em vez de criar outro. Nunca aparece em tela nem em link.
    idempotencyKey: uuid("idempotency_key"),
  },
  (t) => [
    uniqueIndex("orders_store_number_unique").on(t.storeId, t.orderNumber),
    uniqueIndex("orders_public_token_unique").on(t.publicToken),
    uniqueIndex("orders_store_idempotency_unique").on(t.storeId, t.idempotencyKey),
    index("orders_mp_order_idx").on(t.mpOrderId),
    index("orders_store_status_created_idx").on(t.storeId, t.status, t.createdAt),
    index("orders_customer_created_idx").on(t.customerId, t.createdAt),
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

/** "SEM cebola": ingrediente da ficha que o cliente pediu para tirar. Cópia do nome; não mexe no preço. */
export const orderItemRemovals = pgTable(
  "order_item_removals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
    nameSnapshot: text("name_snapshot").notNull(),
  },
  (t) => [index("order_item_removals_item_idx").on(t.orderItemId)],
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
  removals: many(orderItemRemovals),
}))

export const orderItemRemovalsRelations = relations(orderItemRemovals, ({ one }) => ({
  orderItem: one(orderItems, { fields: [orderItemRemovals.orderItemId], references: [orderItems.id] }),
}))

export const orderItemIngredientsRelations = relations(orderItemIngredients, ({ one }) => ({
  orderItem: one(orderItems, { fields: [orderItemIngredients.orderItemId], references: [orderItems.id] }),
  ingredient: one(ingredients, { fields: [orderItemIngredients.ingredientId], references: [ingredients.id] }),
}))
