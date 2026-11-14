CREATE INDEX "orders_stock_pending_idx" ON "orders" USING btree ("created_at") WHERE "orders"."stock_applied_at" is null;--> statement-breakpoint
CREATE INDEX "orders_stock_return_idx" ON "orders" USING btree ("created_at") WHERE "orders"."status" = 'cancelled' and "orders"."stock_applied_at" is not null and "orders"."stock_returned_at" is null;
--> statement-breakpoint
-- Consumo (revisão do 9b): "sem X" vale também quando a ficha usa o adicional de mesmo nome; combo soma a ficha própria E a dos lanches que inclui; ingrediente desativado não conta.
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
  ),
  base AS (
    SELECT b.ingredient_id, b.amount
      FROM (SELECT * FROM own UNION ALL SELECT * FROM combo) b
     WHERE NOT EXISTS (
       SELECT 1
         FROM order_item_removals r
         JOIN ingredients ri ON ri.id = b.ingredient_id
        WHERE r.order_item_id = b.line
          AND (r.ingredient_id = b.ingredient_id OR lower(btrim(r.name_snapshot)) = lower(btrim(ri.name))))
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
   WHERE i.track_stock AND i.active
   GROUP BY u.ingredient_id
$$;
--> statement-breakpoint
-- "Acabou": mesmas regras do consumo; soma o mesmo ingrediente vindo da ficha e dos lanches incluídos; loja sem estoque controlado não faz conta.
CREATE OR REPLACE FUNCTION menu_item_out_of_stock(p_item_id uuid, p_qty int DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_store uuid;
  v_descr text;
BEGIN
  SELECT store_id, regexp_replace(lower(coalesce(description, '')), '\s+', ' ', 'g') INTO v_store, v_descr
    FROM menu_items WHERE id = p_item_id;
  -- Loja que não controla estoque (a maioria): não faz conta nenhuma
  IF v_store IS NULL OR NOT EXISTS (SELECT 1 FROM ingredients WHERE store_id = v_store AND track_stock AND active) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM (
        SELECT mi.ingredient_id, mi.quantity FROM menu_item_ingredients mi WHERE mi.menu_item_id = p_item_id AND mi.quantity > 0
        UNION ALL
        SELECT mi.ingredient_id, mi.quantity
          FROM menu_items c
          JOIN menu_item_ingredients mi ON mi.menu_item_id = c.id
         WHERE c.store_id = v_store AND c.id <> p_item_id AND mi.quantity > 0
           AND strpos(v_descr, regexp_replace(lower(btrim(c.name)), '\s+', ' ', 'g')) > 0
      ) n
      JOIN ingredients i ON i.id = n.ingredient_id
     WHERE i.track_stock AND i.active
     GROUP BY i.id, i.stock
    HAVING i.stock < sum(n.quantity) * p_qty
  );
END;
$$;
--> statement-breakpoint
-- create_order: adicional controlado conferido pela quantidade pedida (porção × qtd do adicional × qtd do lanche).
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
           AND (NOT track_stock OR stock >= extra_amount * v_extra_qty * v_qty); -- estoque (9b): pela quantidade pedida
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
