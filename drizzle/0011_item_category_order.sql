ALTER TABLE "menu_item_categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Ordem inicial: a que o cardápio já mostrava (ordem do item na categoria principal, depois nome)
UPDATE "menu_item_categories" l SET "sort_order" = o.n
  FROM (
    SELECT l2.menu_item_id, l2.category_id,
           row_number() OVER (PARTITION BY l2.category_id ORDER BY i.sort_order, i.name) - 1 AS n
      FROM "menu_item_categories" l2 JOIN "menu_items" i ON i.id = l2.menu_item_id
  ) o
 WHERE l.menu_item_id = o.menu_item_id AND l.category_id = o.category_id;
