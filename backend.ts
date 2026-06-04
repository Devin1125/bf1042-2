import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysia/cors";
import { and, desc, eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import toTaipeiDateTime from "./util.ts";
import {
  adminUserListResponseSchema,
  adminUserResponseSchema,
  apiErrorResponseSchema,
  createMenuItemBodySchema,
  createRoleRequestBodySchema,
  deleteMenuItemParamsSchema,
  getOrderByIdParamsSchema,
  healthResponseSchema,
  listRoleRequestsQuerySchema,
  menuItemResponseSchema,
  menuListResponseSchema,
  nullableOrderResponseEnvelopeSchema,
  orderListResponseSchema,
  orderResponseEnvelopeSchema,
  reviewRoleRequestBodySchema,
  reviewRoleRequestParamsSchema,
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  setUserRolesBodySchema,
  setUserRolesParamsSchema,
  sessionUserResponseSchema,
  submitOrderParamsSchema,
  toOrderResponse,
  updateMenuItemBodySchema,
  updateMenuItemParamsSchema,
  updateOrderBodySchema,
  updateOrderParamsSchema,
  updateOrderStatusBodySchema,
  updateOrderStatusParamsSchema,
} from "./shared/route-schemas.ts";
import { createStore } from "./store/index.ts";
import { auth, getCurrentUser } from "./auth/better-auth.ts";
import { canAccessResource, hasAnyRole, requireAnyRole, requireRole } from "./shared/guards.ts";
import type { AdminUser, Role, RoleRequest } from "./shared/contracts.ts";
import { db } from "./db/client.ts";
import { user as userTable } from "./db/auth-schema.ts";
import { roleRequestsTable } from "./db/schema.ts";

// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
const store = createStore({ dataFilePath: "./data/store.json" });
const hasPublicAssets =
  existsSync("./public") && existsSync("./public/index.html");

// ─── Auth Helper ──────────────────────────────────────────────────────────────
// 簡化的 helper 函數，用於保護路由並獲取 user，失敗時拋出 401 錯誤
async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

const staffOrderRoles: Role[] = ["staff", "chef", "owner", "admin"];
const menuManagerRoles: Role[] = ["owner", "admin"];
const kitchenRoles: Role[] = ["chef", "owner", "admin"];

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRoleRequest(
  row: typeof roleRequestsTable.$inferSelect,
  requestUser?: Pick<typeof userTable.$inferSelect, "email" | "name"> | null,
): RoleRequest {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: requestUser?.email,
    userName: requestUser?.name,
    requestedRole: row.requestedRole === "chef" ? "chef" : "staff",
    reason: row.reason,
    status:
      row.status === "approved" || row.status === "rejected"
        ? row.status
        : "pending",
    requestedAt: toIso(row.requestedAt) ?? new Date().toISOString(),
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: toIso(row.reviewedAt),
    reviewNote: row.reviewNote ?? undefined,
  };
}

function mapAdminUser(row: typeof userTable.$inferSelect): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roles: normalizeRoles(row.roles),
    emailVerified: row.emailVerified,
    createdAt: toIso(row.createdAt),
  };
}

function normalizeRoles(rawRoles: unknown): Role[] {
  const valid = new Set<Role>(["customer", "staff", "chef", "owner", "admin"]);
  const roles = Array.isArray(rawRoles)
    ? rawRoles.filter((role): role is Role => valid.has(role as Role))
    : [];
  return roles.length > 0 ? roles : ["customer"];
}

const app = new Elysia();

// ─── CORS Plugin ──────────────────────────────────────────────────────────────
app.use(
  cors({
    origin:
      allowedOrigin === "*" ? "*" : allowedOrigin || "http://localhost:5173",
    credentials: allowedOrigin !== "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Better Auth Routes ───────────────────────────────────────────────────────
// ⚠️ 注意：不能使用 app.mount("/api/auth", auth.handler)
// 原因：Better Auth handler 是標準的 fetch handler function，
//       但 Elysia 的 .mount() 期望的是 Elysia instance 或特定格式的 handler。
//       測試結果：.mount() 會導致 404 錯誤。
//
// ✅ 正確做法：使用 wildcard 路由明確處理 GET 和 POST
// 必須在其他 API 路由之前定義，確保 Better Auth 路由優先匹配
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));

// ─── OpenAPI Plugin ───────────────────────────────────────────────────────────
app.use(
  openapi({
    path: "/openapi",
    specPath: "/openapi/json",
    documentation: {
      info: {
        title: "Breakfast Demo API",
        version: "0.2.3",
        description:
          "Breakfast ordering demo API for teaching route schema, contract-first design, and future database/auth upgrades. V9-clean-better-auth-v3: optimized static handling, CORS plugin, and Better Auth macro integration.",
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "menu", description: "Menu management endpoints" },
        { name: "orders", description: "Order query and mutation endpoints" },
        { name: "users", description: "Current user role request endpoints" },
        { name: "admin", description: "RBAC administration endpoints" },
        { name: "system", description: "System and health check endpoints" },
      ],
    },
    exclude: {
      staticFile: true,
      paths: ["/openapi", "/openapi/json"],
    },
  }),
);

// 請求記錄中間件
// ─── Request Logger ───────────────────────────────────────────────────────────
app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

// API 路由

app.get(
  "/api/me",
  async ({ request }) => {
    const user = await requireUser(request);
    return { data: user };
  },
  {
    detail: {
      tags: ["auth"],
      summary: "Get current session user with roles",
      description:
        "Return the current authenticated user projected from DB, including RBAC roles.",
    },
    response: {
      200: sessionUserResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// ─── Sign-out Proxy ───────────────────────────────────────────────────────────
// Better Auth 的 /api/auth/sign-out 有 CSRF origin 驗證（比對 trustedOrigins）。
// production 環境若 BETTER_AUTH_URL 設定錯誤（如仍是 localhost），
// 瀏覽器送出的 Origin（正式網址）不在白名單，導致 sign-out 回 403 但前端不知道，
// 造成「看似登出，實際 session 仍在」的假登出。
//
// 解法：在 Elysia 層加一個 proxy，以 server 信任的 baseURL 當 Origin 轉發給 Better Auth。
// 安全性：session 識別仍靠 cookie，CSRF bypass 只在 server 端發生，不降低安全性。
app.post("/api/sign-out", async ({ request }) => {
  const baBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  // 複製原始 headers，強制覆寫 origin 為 Better Auth 信任的 baseURL
  const proxiedHeaders = new Headers(request.headers);
  proxiedHeaders.set("origin", baBaseUrl);

  const proxiedRequest = new Request(`${baBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: proxiedHeaders,
  });

  const res = await auth.handler(proxiedRequest);
  if (!res.ok) {
    const body = await res
      .clone()
      .text()
      .catch(() => "(unreadable)");
    console.error(`[sign-out proxy] Better Auth returned ${res.status}:`, body);
  }
  return res;
});

// 菜單路由
app.get("/api/menu", () => ({ data: [...store.getMenu()] }), {
  detail: {
    tags: ["menu"],
    summary: "List menu items",
    description: "Return all available breakfast menu items.",
  },
  response: {
    200: menuListResponseSchema,
  },
});

app.post(
  "/api/menu",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);
    const newMenuItem = await store.createMenuItem(body);
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: createMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Create a menu item",
      description: "Add a new menu item into the breakfast menu. Requires owner/admin.",
    },
    response: {
      201: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);
    const menuId = parseInt(params.id);
    const menuItem = await store.updateMenuItem(menuId, body);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: menuItem };
  },
  {
    params: updateMenuItemParamsSchema,
    body: updateMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Update a menu item",
      description: "Update fields of an existing menu item. Requires owner/admin.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, menuManagerRoles);
    const menuId = parseInt(params.id);
    const removedMenuItem = await store.deleteMenuItem(menuId);

    if (!removedMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: removedMenuItem };
  },
  {
    params: deleteMenuItemParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "Delete a menu item",
      description: "Remove a menu item by id. Requires owner/admin.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 訂單列表路由
app.get(
  "/api/orders",
  async ({ request }) => {
    const user = await requireUser(request);
    const allOrders = store.getOrders();
    const orders = hasAnyRole(user, ["owner", "admin"])
      ? allOrders
      : hasAnyRole(user, ["chef"])
        ? allOrders.filter((order) =>
            ["submitted", "preparing", "ready"].includes(order.status),
          )
        : hasAnyRole(user, ["staff"])
          ? allOrders.filter((order) => order.status !== "pending")
          : store.getOrdersByUserId(user.id);

    return {
      data: orders.map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "List orders by role",
      description:
        "Customers see only their orders. Staff see submitted front-counter orders. Chefs see active kitchen orders. Owner/admin see all orders.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 取得使用者目前進行中的訂單
app.get(
  "/api/orders/current",
  async ({ request }) => {
    const user = await requireUser(request);
    const currentOrder = store.getCurrentOrderByUserId(user.id);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get current order",
      description:
        "Return the current pending order of a user, or null if none exists.",
    },
    response: {
      200: nullableOrderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 取得使用者歷史訂單
app.get(
  "/api/orders/history",
  async ({ request }) => {
    const user = await requireUser(request);
    return {
      data: store.getOrderHistoryByUserId(user.id).map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get order history",
      description: "Return submitted orders belonging to a user.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 創建新訂單
app.post(
  "/api/orders",
  async ({ request, set }) => {
    const user = await requireUser(request);
    const existingOrder = store.getCurrentOrderByUserId(user.id);
    if (existingOrder) {
      return { data: toOrderResponse(existingOrder) };
    }

    const newOrder = await store.createOrder({ userId: user.id });
    set.status = 201;
    return { data: toOrderResponse(newOrder) };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Create or reuse current order",
      description:
        "Create a new pending order, or return the existing pending order for the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      201: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 獲取單筆訂單
app.get(
  "/api/orders/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!canAccessResource(user, order.userId, staffOrderRoles)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    return { data: toOrderResponse(order) };
  },
  {
    params: getOrderByIdParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Get order by id",
      description:
        "Return a single order when it belongs to the requested user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/status",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, kitchenRoles);

    const orderId = parseInt(params.id, 10);
    const result = await store.updateOrderStatus(orderId, body.status);

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "INVALID_STATUS_TRANSITION") {
      set.status = 409;
      return { error: "Pending cart orders cannot be moved through kitchen statuses" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: updateOrderStatusParamsSchema,
    body: updateOrderStatusBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update kitchen order status",
      description:
        "Move submitted orders through preparing, ready, completed or cancelled. Requires chef/owner/admin.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.post(
  "/api/users/me/role-request",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    const existingRequests = await db
      .select()
      .from(roleRequestsTable)
      .where(
        and(
          eq(roleRequestsTable.userId, user.id),
          eq(roleRequestsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (existingRequests.length > 0) {
      set.status = 400;
      return { error: "You already have a pending role request" };
    }

    const [inserted] = await db
      .insert(roleRequestsTable)
      .values({
        userId: user.id,
        requestedRole: body.requestedRole,
        reason: body.reason,
        requestedAt: new Date(),
      })
      .returning();

    if (!inserted) {
      set.status = 500;
      return { error: "Failed to create role request" };
    }

    set.status = 201;
    return { data: mapRoleRequest(inserted, user) };
  },
  {
    body: createRoleRequestBodySchema,
    detail: {
      tags: ["users"],
      summary: "Request staff or chef role",
      description: "Create one pending role upgrade request for the current user.",
    },
    response: {
      201: roleRequestResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/users",
  async ({ request }) => {
    const user = await requireUser(request);
    requireRole(user, "admin");

    const users = await db
      .select()
      .from(userTable)
      .orderBy(desc(userTable.createdAt));

    return { data: users.map(mapAdminUser) };
  },
  {
    detail: {
      tags: ["admin"],
      summary: "List users",
      description: "List users and roles. Requires admin.",
    },
    response: {
      200: adminUserListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/role-requests",
  async ({ query, request }) => {
    const user = await requireUser(request);
    requireRole(user, "admin");

    const status = query.status ?? "pending";
    const rows = await db
      .select({
        request: roleRequestsTable,
        requestUser: userTable,
      })
      .from(roleRequestsTable)
      .leftJoin(userTable, eq(roleRequestsTable.userId, userTable.id))
      .where(
        status !== "all" ? eq(roleRequestsTable.status, status) : undefined,
      )
      .orderBy(desc(roleRequestsTable.requestedAt));

    return {
      data: rows.map((row) => mapRoleRequest(row.request, row.requestUser)),
    };
  },
  {
    query: listRoleRequestsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "List role requests",
      description: "List role upgrade requests. Requires admin.",
    },
    response: {
      200: roleRequestListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/role-requests/:id",
  async ({ params, body, request, set }) => {
    const reviewer = await requireUser(request);
    requireRole(reviewer, "admin");

    const requestId = parseInt(params.id, 10);
    const [existingRequest] = await db
      .select()
      .from(roleRequestsTable)
      .where(eq(roleRequestsTable.id, requestId))
      .limit(1);

    if (!existingRequest) {
      set.status = 404;
      return { error: "Role request not found" };
    }

    if (existingRequest.status !== "pending") {
      set.status = 400;
      return { error: "This request has already been reviewed" };
    }

    const [updatedRequest] = await db
      .update(roleRequestsTable)
      .set({
        status: body.status,
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote,
      })
      .where(eq(roleRequestsTable.id, requestId))
      .returning();

    if (!updatedRequest) {
      set.status = 500;
      return { error: "Failed to update role request" };
    }

    if (body.status === "approved") {
      const [targetUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, existingRequest.userId))
        .limit(1);

      if (targetUser) {
        const nextRoles = Array.from(
          new Set([...normalizeRoles(targetUser.roles), existingRequest.requestedRole]),
        );

        await db
          .update(userTable)
          .set({ roles: nextRoles, updatedAt: new Date() })
          .where(eq(userTable.id, existingRequest.userId));
      }
    }

    return { data: mapRoleRequest(updatedRequest) };
  },
  {
    params: reviewRoleRequestParamsSchema,
    body: reviewRoleRequestBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Review role request",
      description: "Approve or reject a pending role request. Requires admin.",
    },
    response: {
      200: roleRequestResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/users/:userId/roles",
  async ({ params, body, request, set }) => {
    const actor = await requireUser(request);
    requireRole(actor, "admin");

    const nextRoles = Array.from(new Set(body.roles));
    const [updatedUser] = await db
      .update(userTable)
      .set({ roles: nextRoles, updatedAt: new Date() })
      .where(eq(userTable.id, params.userId))
      .returning();

    if (!updatedUser) {
      set.status = 404;
      return { error: "User not found" };
    }

    return { data: mapAdminUser(updatedUser) };
  },
  {
    params: setUserRolesParamsSchema,
    body: setUserRolesBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Set user roles",
      description: "Directly assign roles to a user. Requires admin.",
    },
    response: {
      200: adminUserResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 更新訂單項目
app.patch(
  "/api/orders/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id);
    const result = await store.updateOrderItem(orderId, {
      userId: user.id,
      itemId: body.itemId,
      qty: body.qty,
    });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "MENU_ITEM_NOT_FOUND") {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order is not editable" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: updateOrderParamsSchema,
    body: updateOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update order item quantity",
      description: "Set the quantity of a menu item within a pending order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 送出訂單
app.post(
  "/api/orders/:id/submit",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const result = await store.submitOrder(orderId, { userId: user.id });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order already submitted" };
    }

    if (!result.ok && result.code === "EMPTY_ORDER") {
      set.status = 400;
      return { error: "Empty order cannot be submitted" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: submitOrderParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Submit order",
      description: "Submit a pending order that belongs to the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 健康檢查路由
app.get("/health", () => ({ status: "ok" }), {
  detail: {
    tags: ["system"],
    summary: "Health check",
    description: "Return API health status.",
  },
  response: {
    200: healthResponseSchema,
  },
});

// ─── Manual Static File & SPA Fallback ────────────────────────────────────────
// 完全手動處理靜態檔案和 SPA fallback，避免 staticPlugin 的路由衝突問題
if (hasPublicAssets) {
  app.get("*", async ({ request }) => {
    const pathname = new URL(request.url).pathname;

    // API 路徑返回 404
    if (pathname.startsWith("/api/") || pathname.startsWith("/openapi")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 嘗試回傳對應的靜態檔案
    const staticFile = Bun.file(`./public${pathname}`);
    if (pathname !== "/" && (await staticFile.exists())) {
      return staticFile;
    }

    // SPA fallback: 回傳 index.html
    return Bun.file("./public/index.html");
  });
}

// 全域錯誤處理
app.onError(({ error, set, code }) => {
  if (error instanceof Response) {
    return error;
  }

  if (code === "VALIDATION") {
    set.status = 400;
    return {
      error: "Validation failed",
      message: "Please check your request parameters",
    };
  }

  set.status = 500;
  return { error: "Internal server error" };
});

// 啟動服務器
await store.init();

app.listen(port, () => {
  console.log(`🍳 早餐店 API 運行在 http://${host}:${port}`);
  console.log(`🌐 Web App: http://${host}:${port}`);
  console.log(`📋 菜單 API: http://${host}:${port}/api/menu`);
  console.log(`📦 訂單 API: http://${host}:${port}/api/orders`);
  console.log(`💚 健康檢查: http://${host}:${port}/health`);
  console.log(`🔐 CORS Origin: ${allowedOrigin}`);
  if (!hasPublicAssets) {
    console.log(
      "⚠️ public/ 不存在，目前只提供 API。若要提供前端頁面，先執行 bun run build:frontend",
    );
  }
});
