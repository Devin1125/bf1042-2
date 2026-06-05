ALTER TABLE "bf_v10"."orders"
ADD COLUMN IF NOT EXISTS "discount" integer NOT NULL DEFAULT 0;

ALTER TABLE "bf_v10"."orders"
ADD COLUMN IF NOT EXISTS "coupon_code" text;

ALTER TABLE "bf_v10"."orders"
ADD COLUMN IF NOT EXISTS "coupon_label" text;
