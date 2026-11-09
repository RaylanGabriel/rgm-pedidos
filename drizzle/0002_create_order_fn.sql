-- Cria um pedido de forma atômica. Os preços vêm SEMPRE do banco, nunca do navegador.
--
-- p_items: [{ "menuItemId": uuid, "quantity": int, "extras": [{ "ingredientId": uuid, "quantity": int }] }]
--   - quantity do item: quantos lanches iguais
--   - quantity do extra: quantos daquele adicional EM CADA lanche
--
-- Erros (mensagem começa com um código, tratado em lib/orders.ts):
--   STORE_NOT_FOUND, STORE_CLOSED, INVALID_ITEMS, ITEM_UNAVAILABLE:<nome>, EXTRA_UNAVAILABLE
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
  p_require_open boolean
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_store         stores%ROWTYPE;
  v_order_id      uuid;
  v_order_number  int;
  v_item          jsonb;
  v_extra         jsonb;
  v_menu          menu_items%ROWTYPE;
  v_ing           ingredients%ROWTYPE;
  v_order_item_id uuid;
  v_qty           int;
  v_extra_qty     int;
  v_line          numeric(10, 2);
  v_subtotal      numeric(10, 2) := 0;
  v_active        int;
  v_wait          int;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
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

  -- Tempo estimado: preparo médio + 3 min por pedido já na fila (máx. 120)
  SELECT count(*) INTO v_active FROM orders
   WHERE store_id = p_store_id AND status IN ('pending', 'preparing');
  v_wait := LEAST(v_store.avg_prep_minutes + v_active * 3, 120);

  INSERT INTO orders (store_id, order_number, public_token, customer_name, customer_phone, type,
                      delivery_address, payment_method, subtotal, total, estimated_wait_minutes, notes)
  VALUES (p_store_id, v_order_number, p_public_token, p_customer_name, p_customer_phone, p_type,
          p_delivery_address, p_payment_method, 0, 0, v_wait, p_notes)
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
      FOR v_extra IN SELECT * FROM jsonb_array_elements(v_item -> 'extras') LOOP
        v_extra_qty := (v_extra ->> 'quantity')::int;
        IF v_extra_qty IS NULL OR v_extra_qty < 1 OR v_extra_qty > 10 THEN
          RAISE EXCEPTION 'INVALID_ITEMS';
        END IF;

        SELECT * INTO v_ing FROM ingredients
         WHERE id = (v_extra ->> 'ingredientId')::uuid AND store_id = p_store_id AND active;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'EXTRA_UNAVAILABLE';
        END IF;

        INSERT INTO order_item_ingredients (order_item_id, ingredient_id, name_snapshot, unit_price, quantity)
        VALUES (v_order_item_id, v_ing.id, v_ing.name, v_ing.price, v_extra_qty);

        v_line := v_line + v_ing.price * v_extra_qty;
      END LOOP;
    END IF;

    v_subtotal := v_subtotal + v_line * v_qty;
  END LOOP;

  UPDATE orders SET subtotal = v_subtotal, total = v_subtotal + delivery_fee
   WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'publicToken', p_public_token,
    'total', v_subtotal,
    'estimatedWaitMinutes', v_wait
  );
END;
$$;
