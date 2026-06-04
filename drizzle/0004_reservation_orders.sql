ALTER TABLE "bf_v10"."orders" ADD COLUMN IF NOT EXISTS "pickup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bf_v10"."orders" ADD COLUMN IF NOT EXISTS "note" text;
