ALTER TABLE "stores" ADD COLUMN "hours_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "manual_until" timestamp with time zone;