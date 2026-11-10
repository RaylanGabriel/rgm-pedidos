ALTER TABLE "orders" ADD COLUMN "out_for_delivery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "auto_delivered" boolean DEFAULT false NOT NULL;