-- Seed: primeira loja (Mr. Smash Street) com o cardápio do sistema antigo.
-- Rode DEPOIS de `npm run db:migrate`, no SQL Editor do Neon.
-- Idempotente pelo slug: se a loja já existir, não faz nada.

DO $$
DECLARE
  v_store uuid;
  v_cat   uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM stores WHERE slug = 'mr-smash') THEN
    RAISE NOTICE 'Loja mr-smash já existe, seed ignorado.';
    RETURN;
  END IF;

  INSERT INTO stores (slug, name, logo_url, avg_prep_minutes)
  VALUES ('mr-smash', 'Mr. Smash Street', '/logo.png', 15)
  RETURNING id INTO v_store;

  INSERT INTO categories (store_id, name, sort_order)
  VALUES (v_store, 'Smash Burgers', 0)
  RETURNING id INTO v_cat;

  INSERT INTO menu_items (store_id, category_id, name, description, price, sort_order) VALUES
    (v_store, v_cat, 'Smash Clássico', 'Blend de carne 120g, queijo cheddar, alface, tomate e molho especial', 18.90, 0),
    (v_store, v_cat, 'Smash Bacon',    'Blend de carne 120g, bacon crocante, queijo cheddar e molho barbecue', 21.90, 1),
    (v_store, v_cat, 'Smash Duplo',    'Dois blends de carne 120g, queijo cheddar duplo e cebola caramelizada', 27.90, 2),
    (v_store, v_cat, 'Smash Salada',   'Blend de carne 120g, alface, tomate, picles, cebola roxa e molho ranch', 19.90, 3);

  INSERT INTO ingredients (store_id, name, price, group_name) VALUES
    (v_store, 'Hambúrguer (120g)',   8.00, 'Proteína'),
    (v_store, 'Bacon',               5.00, 'Proteína'),
    (v_store, 'Cheddar',             3.50, 'Queijo'),
    (v_store, 'Queijo Mussarela',    3.00, 'Queijo'),
    (v_store, 'Alface',              1.00, 'Vegetais'),
    (v_store, 'Tomate',              1.00, 'Vegetais'),
    (v_store, 'Cebola Roxa',         1.00, 'Vegetais'),
    (v_store, 'Picles',              1.50, 'Vegetais'),
    (v_store, 'Cebola Caramelizada', 2.50, 'Vegetais'),
    (v_store, 'Molho Especial',      0.50, 'Molhos'),
    (v_store, 'Molho Barbecue',      0.50, 'Molhos'),
    (v_store, 'Molho Ranch',         0.50, 'Molhos');
END $$;
