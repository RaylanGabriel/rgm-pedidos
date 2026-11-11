CREATE TABLE "store_payment_accounts" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"mp_user_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone NOT NULL,
	"live_mode" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_by" uuid
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "mp_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pix_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pix_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_payment_accounts" ADD CONSTRAINT "store_payment_accounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payment_accounts" ADD CONSTRAINT "store_payment_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_mp_order_idx" ON "orders" USING btree ("mp_order_id");