CREATE TYPE "public"."stock_movement_kind" AS ENUM('order', 'order_return', 'purchase', 'loss', 'adjust');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"delta" numeric(12, 3) NOT NULL,
	"kind" "stock_movement_kind" NOT NULL,
	"order_id" uuid,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "track_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "unit" text DEFAULT 'un' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "stock" numeric(12, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "min_stock" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "extra_amount" numeric(12, 3) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item_ingredients" ADD COLUMN "quantity" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stock_applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stock_returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_store_created_idx" ON "stock_movements" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_ingredient_created_idx" ON "stock_movements" USING btree ("ingredient_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");
--> statement-breakpoint
-- Estoque (9b). Pedidos que já existiam contam como "já descontados": o controle começa agora (o cron de conferência
-- nunca desconta pedido antigo).
UPDATE orders SET stock_applied_at = created_at WHERE stock_applied_at IS NULL;
--> statement-breakpoint
-- Quanto um pedido gasta de cada ingrediente CONTROLADO:
-- ficha do lanche (quantidade × qtd), sem os "sem ___" daquela linha; combo sem ficha própria soma a ficha dos lanches
-- que inclui (nome do lanche na descrição, mesma regra de create_order/lib/recipe.ts); adicionais = extra_amount × qtd
-- do adicional × qtd do lanche.
CREATE OR REPLACE FUNCTION order_stock_usage(p_order_id uuid)
RETURNS TABLE (ingredient_id uuid, amount numeric)
LANGUAGE sql STABLE
AS $$
  WITH lines AS (
    SELECT oi.id AS line, oi.menu_item_id, oi.quantity AS qty, o.store_id,
           regexp_replace(lower(coalesce(m.description, '')), '\s+', ' ', 'g') AS descr
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.order_id = p_order_id
  ),
  own AS (
    SELECT l.line, mi.ingredient_id, mi.quantity * l.qty AS amount
      FROM lines l
      JOIN menu_item_ingredients mi ON mi.menu_item_id = l.menu_item_id
     WHERE mi.quantity > 0
  ),
  combo AS (
    SELECT l.line, mi.ingredient_id, mi.quantity * l.qty AS amount
      FROM lines l
      JOIN menu_items c ON c.store_id = l.store_id AND c.id <> l.menu_item_id
           AND strpos(l.descr, regexp_replace(lower(btrim(c.name)), '\s+', ' ', 'g')) > 0
      JOIN menu_item_ingredients mi ON mi.menu_item_id = c.id
     WHERE mi.quantity > 0
       AND NOT EXISTS (SELECT 1 FROM own o2 WHERE o2.line = l.line)
  ),
  base AS (
    SELECT b.ingredient_id, b.amount
      FROM (SELECT * FROM own UNION ALL SELECT * FROM combo) b
     WHERE NOT EXISTS (
       SELECT 1 FROM order_item_removals r WHERE r.order_item_id = b.line AND r.ingredient_id = b.ingredient_id)
  ),
  extras AS (
    SELECT x.ingredient_id, x.quantity * l.qty * i.extra_amount AS amount
      FROM lines l
      JOIN order_item_ingredients x ON x.order_item_id = l.line
      JOIN ingredients i ON i.id = x.ingredient_id
  )
  SELECT u.ingredient_id, sum(u.amount)
    FROM (SELECT * FROM base UNION ALL SELECT * FROM extras) u
    JOIN ingredients i ON i.id = u.ingredient_id
   WHERE i.track_stock
   GROUP BY u.ingredient_id
$$;
--> statement-breakpoint
-- Desconta o estoque do pedido (entrou na cozinha). Uma vez só por pedido (stock_applied_at); nunca em cancelado.
CREATE OR REPLACE FUNCTION apply_order_stock(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_store uuid;
  v_n     int := 0;
  r       record;
BEGIN
  UPDATE orders SET stock_applied_at = now()
   WHERE id = p_order_id AND stock_applied_at IS NULL AND status <> 'cancelled'
  RETURNING store_id INTO v_store;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  FOR r IN SELECT * FROM order_stock_usage(p_order_id) LOOP
    UPDATE ingredients SET stock = stock - r.amount WHERE id = r.ingredient_id AND store_id = v_store;
    IF FOUND THEN
      INSERT INTO stock_movements (store_id, ingredient_id, delta, kind, order_id)
      VALUES (v_store, r.ingredient_id, -r.amount, 'order', p_order_id);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;
--> statement-breakpoint
-- Devolve exatamente o que o pedido descontou (pelo histórico, mesmo que a ficha tenha mudado). Uma vez só.
CREATE OR REPLACE FUNCTION return_order_stock(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_store uuid;
  v_n     int := 0;
  r       record;
BEGIN
  UPDATE orders SET stock_returned_at = now()
   WHERE id = p_order_id AND stock_applied_at IS NOT NULL AND stock_returned_at IS NULL
  RETURNING store_id INTO v_store;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT m.ingredient_id, -sum(m.delta) AS amount
      FROM stock_movements m
     WHERE m.order_id = p_order_id AND m.kind = 'order'
     GROUP BY m.ingredient_id
  LOOP
    UPDATE ingredients SET stock = stock + r.amount WHERE id = r.ingredient_id AND store_id = v_store;
    IF FOUND THEN
      INSERT INTO stock_movements (store_id, ingredient_id, delta, kind, order_id)
      VALUES (v_store, r.ingredient_id, r.amount, 'order_return', p_order_id);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;
--> statement-breakpoint
-- O lanche acabou? Algum ingrediente controlado da ficha (ou, num combo sem ficha própria, da ficha dos lanches que
-- ele inclui) não tem saldo para p_qty unidades (o cardápio pergunta por 1; o pedido, pela quantidade pedida).
CREATE OR REPLACE FUNCTION menu_item_out_of_stock(p_item_id uuid, p_qty int DEFAULT 1)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  WITH me AS (
    SELECT id, store_id, regexp_replace(lower(coalesce(description, '')), '\s+', ' ', 'g') AS descr
      FROM menu_items WHERE id = p_item_id
  ),
  own AS (
    SELECT mi.ingredient_id, mi.quantity FROM menu_item_ingredients mi WHERE mi.menu_item_id = p_item_id AND mi.quantity > 0
  ),
  inc AS (
    SELECT mi.ingredient_id, mi.quantity
      FROM me
      JOIN menu_items c ON c.store_id = me.store_id AND c.id <> me.id
           AND strpos(me.descr, regexp_replace(lower(btrim(c.name)), '\s+', ' ', 'g')) > 0
      JOIN menu_item_ingredients mi ON mi.menu_item_id = c.id
     WHERE mi.quantity > 0 AND NOT EXISTS (SELECT 1 FROM own)
  )
  SELECT EXISTS (
    SELECT 1 FROM (SELECT * FROM own UNION ALL SELECT * FROM inc) n
      JOIN ingredients i ON i.id = n.ingredient_id
     WHERE i.track_stock AND i.stock < n.quantity * p_qty
  )
$$;
--> statement-breakpoint
-- create_order: igual à 0028 + estoque (9b): lanche ou adicional com ingrediente controlado sem saldo é recusado.
CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_type order_type,
  p_delivery_address text,
  p_payment_method payment_method,
  p_notes text,
  p_items jsonb,
  p_public_token text,
  p_require_open boolean,
  p_delivery_zone_id uuid,
  p_delivery_distance_km numeric,
  p_change_for numeric,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_store         stores%ROWTYPE;
  v_zone          delivery_zones%ROWTYPE;
  v_tier          delivery_distance_tiers%ROWTYPE;
  v_km            numeric(6, 2);
  v_order_id      uuid;
  v_order_number  int;
  v_item          jsonb;
  v_extra         jsonb;
  v_removal       text;
  v_desc          text;
  v_menu          menu_items%ROWTYPE;
  v_ing           ingredients%ROWTYPE;
  v_order_item_id uuid;
  v_qty           int;
  v_extra_qty     int;
  v_line          numeric(10, 2);
  v_subtotal      numeric(10, 2) := 0;
  v_fee           numeric(10, 2) := 0;
  v_zone_name     text;
  v_active        int;
  v_wait          int;
  v_existing      orders%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  -- Mesma tentativa repetida (resposta perdida, toque duplo): devolve o pedido já criado, sem gastar número.
  -- Trava a loja antes de procurar: uma repetição simultânea espera a primeira terminar e então a encontra.
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM stores WHERE id = p_store_id FOR UPDATE;
    SELECT * INTO v_existing FROM orders WHERE store_id = p_store_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_existing.id,
        'orderNumber', v_existing.order_number,
        'publicToken', v_existing.public_token,
        'subtotal', v_existing.subtotal,
        'deliveryFee', v_existing.delivery_fee,
        'total', v_existing.total,
        'estimatedWaitMinutes', v_existing.estimated_wait_minutes,
        'duplicate', true
      );
    END IF;
  END IF;

  -- Incrementar o contador trava a linha da loja: dois pedidos simultâneos nunca recebem o mesmo número
  UPDATE stores SET next_order_number = next_order_number + 1
   WHERE id = p_store_id AND active
  RETURNING * INTO v_store;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND';
  END IF;
  IF p_require_open AND NOT v_store.is_open THEN
    RAISE EXCEPTION 'STORE_CLOSED';
  END IF;
  v_order_number := v_store.next_order_number - 1;

  -- Taxa de entrega
  IF p_type = 'delivery' THEN
    IF NOT v_store.delivery_enabled THEN
      RAISE EXCEPTION 'DELIVERY_UNAVAILABLE';
    END IF;
    IF v_store.delivery_pricing = 'zones' THEN
      SELECT * INTO v_zone FROM delivery_zones
       WHERE id = p_delivery_zone_id AND store_id = p_store_id AND active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ZONE_INVALID';
      END IF;
      v_fee := v_zone.fee;
      v_zone_name := v_zone.name;
    ELSIF v_store.delivery_pricing = 'distance' THEN
      -- A distância vem do servidor da aplicação (endereço localizado lá), nunca do navegador
      IF p_delivery_distance_km IS NULL OR p_delivery_distance_km < 0 THEN
        RAISE EXCEPTION 'DISTANCE_REQUIRED';
      END IF;
      SELECT * INTO v_tier FROM delivery_distance_tiers
       WHERE store_id = p_store_id AND up_to_km >= p_delivery_distance_km
       ORDER BY up_to_km LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'OUT_OF_RANGE:%', (SELECT max(up_to_km) FROM delivery_distance_tiers WHERE store_id = p_store_id);
      END IF;
      v_fee := v_tier.fee;
      v_km := round(p_delivery_distance_km, 2);
      -- Faixa no lugar do bairro: relatórios agrupam por "Até 8 km"
      v_zone_name := 'Até ' || replace(regexp_replace(v_tier.up_to_km::text, '\.0$', ''), '.', ',') || ' km';
    ELSE
      v_fee := v_store.delivery_fixed_fee;
    END IF;
  END IF;

  -- Tempo estimado: preparo médio + 3 min por pedido já na fila (máx. 120)
  SELECT count(*) INTO v_active FROM orders
   WHERE store_id = p_store_id AND status IN ('pending', 'preparing');
  v_wait := LEAST(v_store.avg_prep_minutes + v_active * 3, 120);

  INSERT INTO orders (store_id, order_number, public_token, customer_name, customer_phone, type,
                      delivery_address, delivery_zone_name, delivery_distance_km, payment_method, subtotal, delivery_fee, total,
                      estimated_wait_minutes, notes, idempotency_key)
  VALUES (p_store_id, v_order_number, p_public_token, p_customer_name, p_customer_phone, p_type,
          p_delivery_address, v_zone_name, v_km, p_payment_method, 0, v_fee, 0, v_wait, p_notes, p_idempotency_key)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item ->> 'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 20 THEN
      RAISE EXCEPTION 'INVALID_ITEMS';
    END IF;

    SELECT * INTO v_menu FROM menu_items
     WHERE id = (v_item ->> 'menuItemId')::uuid AND store_id = p_store_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_ITEMS';
    END IF;
    IF NOT v_menu.active OR NOT v_menu.available THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE:%', v_menu.name;
    END IF;
    -- Estoque (9b): ingrediente controlado sem saldo para a quantidade pedida = esgotado
    IF menu_item_out_of_stock(v_menu.id, v_qty) THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE:%', v_menu.name;
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price, quantity)
    VALUES (v_order_id, v_menu.id, v_menu.name, v_menu.price, v_qty)
    RETURNING id INTO v_order_item_id;

    v_line := v_menu.price;

    IF v_item ? 'extras' AND jsonb_typeof(v_item -> 'extras') = 'array' THEN
      IF jsonb_array_length(v_item -> 'extras') > 30 THEN
        RAISE EXCEPTION 'INVALID_ITEMS';
      END IF;
      -- Categoria sem adicionais (ex.: bebidas): não aceita extras
      IF jsonb_array_length(v_item -> 'extras') > 0 AND EXISTS (
           SELECT 1 FROM categories WHERE id = v_menu.category_id AND NOT extras_enabled) THEN
        RAISE EXCEPTION 'EXTRA_UNAVAILABLE';
      END IF;
      FOR v_extra IN SELECT * FROM jsonb_array_elements(v_item -> 'extras') LOOP
        v_extra_qty := (v_extra ->> 'quantity')::int;
        IF v_extra_qty IS NULL OR v_extra_qty < 1 OR v_extra_qty > 10 THEN
          RAISE EXCEPTION 'INVALID_ITEMS';
        END IF;

        SELECT * INTO v_ing FROM ingredients
         WHERE id = (v_extra ->> 'ingredientId')::uuid AND store_id = p_store_id AND active AND is_extra
           AND (NOT track_stock OR stock >= extra_amount); -- estoque (9b): adicional que acabou
        IF NOT FOUND THEN
          RAISE EXCEPTION 'EXTRA_UNAVAILABLE';
        END IF;

        INSERT INTO order_item_ingredients (order_item_id, ingredient_id, name_snapshot, unit_price, quantity)
        VALUES (v_order_item_id, v_ing.id, v_ing.name, v_ing.price, v_extra_qty);

        v_line := v_line + v_ing.price * v_extra_qty;
      END LOOP;
    END IF;

    -- "SEM cebola": só ingrediente que o dono deixou tirar, desta loja, da ficha deste item OU de um item que ele
    -- inclui (combo: o nome do lanche está na descrição — mesma regra de includedItems em lib/recipe.ts).
    -- Não muda o preço.
    v_desc := regexp_replace(lower(coalesce(v_menu.description, '')), '\s+', ' ', 'g');
    IF v_item ? 'removals' AND jsonb_typeof(v_item -> 'removals') = 'array' THEN
      IF jsonb_array_length(v_item -> 'removals') > 30 THEN
        RAISE EXCEPTION 'INVALID_ITEMS';
      END IF;
      FOR v_removal IN SELECT DISTINCT value FROM jsonb_array_elements_text(v_item -> 'removals') LOOP
        SELECT i.* INTO v_ing FROM menu_item_ingredients mi
          JOIN ingredients i ON i.id = mi.ingredient_id
          JOIN menu_items c ON c.id = mi.menu_item_id
         WHERE mi.ingredient_id = v_removal::uuid AND mi.removable AND i.store_id = p_store_id AND c.store_id = p_store_id
           AND (c.id = v_menu.id
                OR strpos(v_desc, regexp_replace(lower(btrim(c.name)), '\s+', ' ', 'g')) > 0)
         LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'REMOVAL_INVALID';
        END IF;
        INSERT INTO order_item_removals (order_item_id, ingredient_id, name_snapshot)
        VALUES (v_order_item_id, v_ing.id, v_ing.name);
      END LOOP;
    END IF;

    v_subtotal := v_subtotal + v_line * v_qty;
  END LOOP;

  IF p_type = 'delivery' AND v_subtotal < v_store.delivery_min_order THEN
    RAISE EXCEPTION 'BELOW_MIN_ORDER:%', v_store.delivery_min_order;
  END IF;

  -- Troco na mesma transação: só em dinheiro e só se a nota cobre o total calculado aqui
  UPDATE orders SET subtotal = v_subtotal, total = v_subtotal + v_fee,
         change_for = CASE WHEN p_payment_method = 'cash' AND p_change_for > v_subtotal + v_fee THEN p_change_for END
   WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'publicToken', p_public_token,
    'subtotal', v_subtotal,
    'deliveryFee', v_fee,
    'total', v_subtotal + v_fee,
    'estimatedWaitMinutes', v_wait,
    'duplicate', false
  );
END;
$$;
