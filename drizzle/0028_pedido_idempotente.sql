ALTER TABLE "orders" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_idempotency_unique" ON "orders" USING btree ("store_id","idempotency_key");
--> statement-breakpoint
-- create_order com chave de idempotência e troco na mesma transação (bug do pedido duplicado, 13/nov/2026).
-- Nova assinatura (14 parâmetros, SEM valores padrão: uma chamada de 12 argumentos continua indo só para a versão
-- antiga, sem ambiguidade). A versão antiga fica até o código novo estar no ar e sai numa migração seguinte.
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
         WHERE id = (v_extra ->> 'ingredientId')::uuid AND store_id = p_store_id AND active AND is_extra;
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
