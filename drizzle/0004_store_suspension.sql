ALTER TABLE "stores" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "suspended_at" timestamp with time zone;