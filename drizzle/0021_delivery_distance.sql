ALTER TYPE "public"."delivery_pricing" ADD VALUE 'distance';--> statement-breakpoint
CREATE TABLE "delivery_distance_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"up_to_km" numeric(5, 1) NOT NULL,
	"fee" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"precise" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_distance_km" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "location" jsonb;--> statement-breakpoint
ALTER TABLE "delivery_distance_tiers" ADD CONSTRAINT "delivery_distance_tiers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_distance_tiers_store_km_unique" ON "delivery_distance_tiers" USING btree ("store_id","up_to_km");