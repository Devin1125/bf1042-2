import { z } from "zod";

// ─── API Business Schemas（Single Source of Truth）──────────────────────────
// 這裡是前後端共用的業務型別定義。
// 型別（TypeScript type）由 Zod schema 自動推導，不需要手動維護兩份。

export const menuItemSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  category: z.string().min(1),
  description: z.string(),
  image_url: z.string().min(1),
});

export const roleSchema = z.enum(["customer", "staff", "chef", "owner", "admin"]);
export const orderStatusSchema = z.enum([
  "pending",
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

// ─── User schemas（業務層）──────────────────────────────────────────────────
// userSchema：完整使用者資料（業務/資料層使用，不對外暴露）
// sessionUserSchema：API 回傳的最小安全投影（不含 password 等敏感欄位）
// 注意：V9 使用 Better Auth，userSchema 由 Better Auth DB 負責儲存。
//       sessionUserSchema 為 auth session 對外的唯一輸出格式。

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(3),
  name: z.string().min(1),
  password: z.string().min(1),
  roles: z.array(roleSchema).min(1).default(["customer"]),
  // 預留個資欄位（V9+ 實作使用者 profile 時使用）
  birthday: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
});

export const sessionUserSchema = userSchema.pick({
  id: true,
  email: true,
  name: true,
  roles: true,
});

export const orderItemSchema = z.object({
  item: menuItemSchema,
  qty: z.number().min(0),
});

export const orderSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  items: z.array(orderItemSchema),
  total: z.number().min(0),
  status: orderStatusSchema,
  createdAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
});

export const roleRequestSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  userEmail: z.string().min(3).optional(),
  userName: z.string().min(1).optional(),
  requestedRole: z.enum(["staff", "chef"]),
  reason: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedAt: z.string().min(1),
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: z.string().min(1).optional(),
  reviewNote: z.string().optional(),
});

export const adminUserSchema = sessionUserSchema.extend({
  emailVerified: z.boolean().optional(),
  createdAt: z.string().optional(),
});

// ─── Derived TypeScript Types（自動推導，永不過時）───────────────────────────
export type MenuItem = z.infer<typeof menuItemSchema>;
export type Role = z.infer<typeof roleSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type User = z.infer<typeof userSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type RoleRequest = z.infer<typeof roleRequestSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;

export interface ApiDataResponse<T> {
  data: T;
}
