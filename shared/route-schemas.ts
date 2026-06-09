import { z } from "zod";
import type { Order } from "./contracts.ts";
import {
  adminUserSchema,
  menuItemSchema,
  orderSchema,
  orderStatusSchema,
  roleRequestSchema,
  roleSchema,
  sessionUserSchema,
} from "./contracts.ts";
import toTaipeiDateTime from "../util.ts";

export type { Order };

// ─── API Layer Error Response（API 層錯誤格式定義）────────────────────────

export const apiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

// ─── API Layer Order Response（Order 的 API 層呈現）──────────────────────

export const orderResponseSchema = orderSchema.extend({
  createdAtTaipei: z.string().min(1),
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;

/**
 * 將數據庫/內部 Order 轉換為 API 響應格式
 * 添加台北時區時間戳
 */
export function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

// ─── Request Schemas（按 route 分組）────────────────────────────────────

/** POST /api/menu */
export const createMenuItemBodySchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0),
  category: z.string().min(1),
  description: z.string().min(1),
  image_url: z.string().min(1),
});

/** PATCH /api/menu/:id */
export const updateMenuItemParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateMenuItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().int().min(0).optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  image_url: z.string().min(1).optional(),
});

/** DELETE /api/menu/:id */
export const deleteMenuItemParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** GET /api/orders/:id */
export const getOrderByIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** PATCH /api/orders/:id */
export const updateOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderBodySchema = z.object({
  itemId: z.number().int().min(1),
  qty: z.number().min(0),
});

/** PATCH /api/orders/:id/status */
export const updateOrderStatusParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderStatusBodySchema = z.object({
  status: orderStatusSchema.exclude(["pending"]),
});

/** POST /api/orders/:id/submit */
export const submitOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** POST /api/users/me/role-request */
export const createRoleRequestBodySchema = z.object({
  requestedRole: z.enum(["staff", "chef"]),
  reason: z.string().min(10),
});

/** GET /api/admin/role-requests */
export const listRoleRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).optional(),
});

/** PATCH /api/admin/role-requests/:id */
export const reviewRoleRequestParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const reviewRoleRequestBodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().optional(),
});

/** PATCH /api/admin/users/:userId/roles */
export const setUserRolesParamsSchema = z.object({
  userId: z.string().min(1),
});

export const setUserRolesBodySchema = z.object({
  roles: z.array(roleSchema).min(1),
});

// ─── Response Schemas（API envelope 層）─────────────────────────────────

export const menuListResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

export const menuItemResponseSchema = z.object({
  data: menuItemSchema,
});

export const orderListResponseSchema = z.object({
  data: z.array(orderResponseSchema),
});

export const orderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema,
});

export const nullableOrderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema.nullable(),
});

export const healthResponseSchema = z.object({
  status: z.string(),
});

export const sessionUserResponseSchema = z.object({
  data: sessionUserSchema,
});

export const roleRequestResponseSchema = z.object({
  data: roleRequestSchema,
});

export const roleRequestListResponseSchema = z.object({
  data: z.array(roleRequestSchema),
});

export const adminUserResponseSchema = z.object({
  data: adminUserSchema,
});

export const adminUserListResponseSchema = z.object({
  data: z.array(adminUserSchema),
});
