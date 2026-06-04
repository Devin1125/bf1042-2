INSERT INTO "bf_v10"."menu_items" ("name", "price", "category", "description", "image_url")
SELECT
  '早餐吃到飽',
  500,
  '方案',
  '預約時段內可享店內早餐吃到飽，適合想一次吃齊多種餐點的顧客。',
  'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=800&q=80'
WHERE NOT EXISTS (
  SELECT 1 FROM "bf_v10"."menu_items" WHERE "name" = '早餐吃到飽'
);
