CREATE TYPE "public"."delivery_pricing" AS ENUM('fixed', 'zones');--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fee" numeric(10, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_zone_name" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "delivery_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "delivery_pricing" "delivery_pricing" DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "delivery_fixed_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "delivery_min_order" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_store_name_unique" ON "delivery_zones" USING btree ("store_id",lower("name"));