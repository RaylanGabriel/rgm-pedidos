CREATE TABLE "menu_item_categories" (
	"menu_item_id" uuid NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_categories_pk" ON "menu_item_categories" USING btree ("menu_item_id","category_id");--> statement-breakpoint
CREATE INDEX "menu_item_categories_cat_idx" ON "menu_item_categories" USING btree ("category_id");