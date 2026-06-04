import { useEffect, useState, useMemo } from "react";
import "./App.css";
import type {
  AdminUser,
  ApiDataResponse,
  MenuItem,
  Order,
  OrderStatus,
  Role,
  RoleRequest,
  SessionUser,
} from "../../shared/contracts.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<
    Record<number, number>
  >({});
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [roleRequestRole, setRoleRequestRole] = useState<"staff" | "chef">(
    "staff",
  );
  const [roleRequestReason, setRoleRequestReason] = useState("");
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [menuDraft, setMenuDraft] = useState({
    name: "",
    price: "",
    category: "",
    description: "",
    image_url: "",
  });
  const [selectedRoleByUserId, setSelectedRoleByUserId] = useState<
    Record<string, Role>
  >({});
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  function navigateTo(path: string) {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  }

  function syncCartFromOrder(order: Order) {
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<number, number>,
    );

    setCartQtyByItemId(nextQtyByItemId);
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartTotal(0);
    setIsCartOpen(false);
  }

  async function loadCurrentOrder(): Promise<Order | null> {
    const response = await fetch(buildApiUrl("/api/orders/current"), {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Load current order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order | null>;
    const currentOrder = payload?.data;

    if (!currentOrder) {
      resetCartState();
      return null;
    }

    setOrderId(currentOrder.id);
    syncCartFromOrder(currentOrder);
    return currentOrder;
  }

  async function loadOrderHistory(): Promise<void> {
    setHistoryLoading(true);

    try {
      const response = await fetch(buildApiUrl("/api/orders/history"), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Load history failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order[]>;
      setHistoryOrders(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshUserOrders(): Promise<void> {
    await Promise.all([loadCurrentOrder(), loadOrderHistory()]);
  }

  useEffect(() => {
    let mounted = true;

    // 從 server 端 session 恢復登入狀態，並取得 DB 內的 RBAC roles。
    async function restoreSession() {
      try {
        const res = await fetch(buildApiUrl("/api/me"), {
          credentials: "include",
        });
        if (res.ok) {
          const payload =
            (await res.json()) as ApiDataResponse<SessionUser> | null;
          if (payload?.data && mounted) {
            setUser(payload.data);
          }
        }
      } catch {
        // session 無法取得，維持未登入狀態
      }
    }
    void restoreSession();

    async function loadMenu() {
      try {
        const response = await fetch(buildApiUrl("/api/menu"));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
        const fetchedItems = Array.isArray(payload?.data) ? payload.data : [];

        if (mounted) {
          setItems(fetchedItems);
        }
      } catch (fetchError) {
        if (mounted) {
          setError("無法取得菜單資料，請稍後再試。");
          console.error(fetchError);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadMenu();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const userRoles = user?.roles ?? [];
  const hasAnyRole = (roles: Role[]): boolean =>
    roles.some((role) => userRoles.includes(role));
  const canViewOperations = hasAnyRole(["staff", "chef", "owner", "admin"]);
  const canUpdateOrderStatus = hasAnyRole(["chef", "owner", "admin"]);
  const canManageMenu = hasAnyRole(["owner", "admin"]);
  const isAdmin = hasAnyRole(["admin"]);
  const isCustomerRoute = currentPath === "/" || currentPath === "/menu";
  const isRoleRequestRoute = currentPath === "/role-request";
  const isCounterRoute = currentPath === "/counter";
  const isKitchenRoute = currentPath === "/kitchen";
  const isOwnerRoute = currentPath === "/owner";
  const isAdminRoute = currentPath === "/admin";
  const isOperationsRoute =
    isCounterRoute || isKitchenRoute || isOwnerRoute || isAdminRoute;
  const canAccessCounter = hasAnyRole(["staff", "owner", "admin"]);
  const canAccessKitchen = hasAnyRole(["chef", "owner", "admin"]);
  const canAccessOwner = hasAnyRole(["owner", "admin"]);

  const canAccessCurrentRoute =
    isCustomerRoute ||
    isRoleRequestRoute ||
    (isCounterRoute && canAccessCounter) ||
    (isKitchenRoute && canAccessKitchen) ||
    (isOwnerRoute && canAccessOwner) ||
    (isAdminRoute && isAdmin);

  useEffect(() => {
    if (!user) {
      setHistoryOrders([]);
      setAllOrders([]);
      setRoleRequests([]);
      setAdminUsers([]);
      setIsCartOpen(false);
      resetCartState();
      return;
    }

    void refreshUserOrders().catch((refreshError) => {
      setActionError("載入使用者訂單資料失敗，請稍後再試。");
      console.error(refreshError);
    });
  }, [user]);

  useEffect(() => {
    void loadOperationsData().catch((operationsError) => {
      setActionError("載入營運資料失敗，請稍後再試。");
      console.error(operationsError);
    });
  }, [user?.id, userRoles.join(","), currentPath]);

  const grouped = useMemo(() => {
    const groupedItems = items.reduce(
      (acc, item) => {
        const category = item?.category || "未分類";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(item);
        return acc;
      },
      {} as Record<string, MenuItem[]>,
    );

    const categories = Object.keys(groupedItems).sort((a, b) =>
      a.localeCompare(b, "zh-Hant"),
    );

    return { groupedItems, categories };
  }, [items]);

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));

    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const itemId = Number(itemIdText);
        const item = itemById.get(itemId);
        if (!item || qty <= 0) {
          return null;
        }

        return {
          itemId,
          qty,
          item,
          subtotal: item.price * qty,
        };
      })
      .filter((entry) => entry !== null);
  }, [cartQtyByItemId, items]);

  const roleView = isKitchenRoute
    ? "chef"
    : isCounterRoute
      ? "staff"
      : isAdminRoute
        ? "admin"
        : isOwnerRoute
          ? "owner"
          : "customer";

  const submittedOrders = useMemo(() => {
    if (roleView === "chef") {
      return allOrders.filter((order) =>
        ["submitted", "preparing", "ready"].includes(order.status),
      );
    }

    if (roleView === "staff") {
      return allOrders.filter((order) => order.status !== "pending");
    }

    if (roleView === "owner" || roleView === "admin") {
      return allOrders;
    }

    return [];
  }, [allOrders, roleView]);

  const operationsTitle =
    roleView === "chef"
      ? "廚房製作看板"
      : roleView === "staff"
        ? "櫃台訂單看板"
        : roleView === "owner"
          ? "店長營運總覽"
          : roleView === "admin"
            ? "系統管理總覽"
            : "我的訂單";

  const operationsDescription =
    roleView === "chef"
      ? "只顯示待處理、製作中與可取餐訂單，讓廚房專心處理餐點。"
      : roleView === "staff"
        ? "顯示已送出的櫃台訂單，協助取餐核對與現場服務。"
        : roleView === "owner"
          ? "顯示全店訂單、營收與菜單管理資料。"
          : roleView === "admin"
            ? "顯示全店資料，並提供角色申請與使用者權限管理。"
            : "";

  const statusCounts = useMemo(() => {
    return allOrders.reduce(
      (acc, order) => {
        acc[order.status] = (acc[order.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<OrderStatus, number>,
    );
  }, [submittedOrders]);

  const salesSummary = useMemo(() => {
    const completedOrders = submittedOrders.filter(
      (order) => order.status !== "pending" && order.status !== "cancelled",
    );
    const totalRevenue = completedOrders.reduce(
      (sum, order) => sum + order.total,
      0,
    );
    const topItems = new Map<string, { name: string; qty: number }>();

    for (const order of completedOrders) {
      for (const detail of order.items) {
        const key = String(detail.item.id);
        const current = topItems.get(key) ?? {
          name: detail.item.name,
          qty: 0,
        };
        current.qty += detail.qty;
        topItems.set(key, current);
      }
    }

    return {
      orderCount: completedOrders.length,
      totalRevenue,
      topItems: Array.from(topItems.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3),
    };
  }, [submittedOrders]);

  async function loadOperationsData(): Promise<void> {
    if (!user || !canViewOperations || !isOperationsRoute) {
      setAllOrders([]);
      return;
    }

    setOperationsLoading(true);
    try {
      const ordersResponse = await fetch(buildApiUrl("/api/orders"), {
        credentials: "include",
      });
      if (ordersResponse.ok) {
        const payload =
          (await ordersResponse.json()) as ApiDataResponse<Order[]>;
        setAllOrders(Array.isArray(payload.data) ? payload.data : []);
      }

      if (isAdmin) {
        const [requestsResponse, usersResponse] = await Promise.all([
          fetch(buildApiUrl("/api/admin/role-requests?status=all"), {
            credentials: "include",
          }),
          fetch(buildApiUrl("/api/admin/users"), {
            credentials: "include",
          }),
        ]);

        if (requestsResponse.ok) {
          const payload =
            (await requestsResponse.json()) as ApiDataResponse<RoleRequest[]>;
          setRoleRequests(Array.isArray(payload.data) ? payload.data : []);
        }

        if (usersResponse.ok) {
          const payload =
            (await usersResponse.json()) as ApiDataResponse<AdminUser[]>;
          setAdminUsers(Array.isArray(payload.data) ? payload.data : []);
        }
      }
    } finally {
      setOperationsLoading(false);
    }
  }

  async function ensureOrder(): Promise<number> {
    if (!user) {
      throw new Error("Please login first");
    }

    if (orderId !== null) {
      return orderId;
    }

    const response = await fetch(buildApiUrl("/api/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        setUser(null);
        setAuthError("登入狀態已失效，請重新登入。");
        setActionError("登入狀態已失效，請重新登入。");
        setHistoryOrders([]);
        resetCartState();
        throw new Error(`Auth expired: HTTP ${response.status}`);
      }

      throw new Error(`Create order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    const createdOrderId = payload?.data?.id;

    if (!createdOrderId) {
      throw new Error("Create order failed: invalid payload");
    }

    setOrderId(createdOrderId);
    return createdOrderId;
  }

  async function handleGoogleSignIn(): Promise<void> {
    setAuthError("");
    setIsGoogleSigningIn(true);
    try {
      // Better Auth 的 social sign-in 入口是 POST。
      // 先向後端取得導向 Google 同意頁的 URL，再切換瀏覽器位置。
      const callbackURL = window.location.origin;
      const response = await fetch(buildApiUrl("/api/auth/sign-in/social"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: "google", callbackURL }),
      });

      if (!response.ok) {
        throw new Error(`Google sign-in failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload?.url) {
        throw new Error("Google sign-in failed: missing redirect URL");
      }

      window.location.href = payload.url;
    } catch {
      setAuthError("Google 登入啟動失敗，請稍後再試。");
      setIsGoogleSigningIn(false);
    }
  }

  async function handleLogout(): Promise<void> {
    // 使用 /api/sign-out（server-side proxy），避免 Better Auth CSRF 驗證
    // 因 BETTER_AUTH_URL 設定錯誤造成的假登出（403 被吃掉）。
    // 若登出失敗，顯示錯誤並中止，確保使用者知道 session 仍存在。
    try {
      const res = await fetch(buildApiUrl("/api/sign-out"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setActionError(
          `登出失敗（HTTP ${res.status}），請重試或手動清除瀏覽器 Cookie。`,
        );
        return;
      }
    } catch {
      setActionError("登出時發生網路錯誤，請重試。");
      return;
    }
    setUser(null);
    setAuthError("");
    setActionError("");
    resetCartState();
  }

  async function addToCart(item: MenuItem): Promise<void> {
    setActionError("");
    setActiveItemId(item.id);

    try {
      if (!user) {
        throw new Error("Please login first");
      }

      const patchOrderItem = async (
        targetOrderId: number,
        qty: number,
      ): Promise<Order> => {
        const response = await fetch(
          buildApiUrl(`/api/orders/${targetOrderId}`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              itemId: item.id,
              qty,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(`Update order failed: HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ApiDataResponse<Order>;
        const updatedOrder = payload?.data;

        if (!updatedOrder) {
          throw new Error("Update order failed: invalid payload");
        }

        return updatedOrder;
      };

      const targetOrderId = await ensureOrder();
      const currentQty = cartQtyByItemId[item.id] ?? 0;
      const nextQty = currentQty + 1;

      try {
        const updatedOrder = await patchOrderItem(targetOrderId, nextQty);
        syncCartFromOrder(updatedOrder);
      } catch (firstTryError) {
        const firstTryMessage =
          firstTryError instanceof Error ? firstTryError.message : "";

        // 換帳號或舊訂單失效時，重新同步目前使用者訂單後再重試一次。
        if (
          firstTryMessage.includes("HTTP 403") ||
          firstTryMessage.includes("HTTP 404")
        ) {
          setOrderId(null);

          const recoveredOrder = await loadCurrentOrder();
          const retryOrderId = recoveredOrder?.id ?? (await ensureOrder());
          const recoveredQty =
            recoveredOrder?.items.find(
              (orderItem) => orderItem.item.id === item.id,
            )?.qty ?? 0;
          const retryQty = recoveredQty + 1;

          const retriedOrder = await patchOrderItem(retryOrderId, retryQty);
          syncCartFromOrder(retriedOrder);
          return;
        }

        throw firstTryError;
      }
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        return;
      }

      if (user) {
        try {
          const recoveredOrder = await loadCurrentOrder();
          const recoveredQty = recoveredOrder?.items.find(
            (orderItem) => orderItem.item.id === item.id,
          )?.qty;

          if (typeof recoveredQty === "number" && recoveredQty > 0) {
            return;
          }
        } catch (recoveryError) {
          console.error(recoveryError);
        }
      }

      setActionError("加入購物車失敗，請稍後再試。");
      console.error(cartError);
    } finally {
      setActiveItemId(null);
    }
  }

  async function clearCart(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setIsClearingCart(true);

    try {
      for (const detail of cartDetails) {
        const response = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            itemId: detail.itemId,
            qty: 0,
          }),
        });

        if (!response.ok) {
          throw new Error(`Clear cart failed: HTTP ${response.status}`);
        }
      }

      setCartQtyByItemId({});
      setCartTotal(0);
    } catch (clearError) {
      setActionError("清空購物車失敗，請稍後再試。");
      console.error(clearError);
    } finally {
      setIsClearingCart(false);
    }
  }

  async function submitOrder(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setIsSubmittingOrder(true);

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${orderId}/submit`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error(`Submit order failed: HTTP ${response.status}`);
      }

      resetCartState();
      setIsCartOpen(false);
      await loadOrderHistory();
      await loadOperationsData();
    } catch (submitError) {
      setActionError("送出訂單失敗，請稍後再試。");
      console.error(submitError);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function submitRoleRequest(): Promise<void> {
    setRoleRequestMessage("");
    const response = await fetch(buildApiUrl("/api/users/me/role-request"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        requestedRole: roleRequestRole,
        reason: roleRequestReason,
      }),
    });

    if (!response.ok) {
      setRoleRequestMessage("申請送出失敗，請確認是否已有待審核申請。");
      return;
    }

    setRoleRequestReason("");
    setRoleRequestMessage("申請已送出。");
  }

  async function createMenuItem(): Promise<void> {
    setActionError("");
    const price = Number.parseInt(menuDraft.price, 10);
    if (!menuDraft.name || !Number.isFinite(price)) {
      setActionError("新增品項失敗，請確認品名與價格。");
      return;
    }

    const response = await fetch(buildApiUrl("/api/menu"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...menuDraft,
        price,
        image_url:
          menuDraft.image_url ||
          "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
      }),
    });

    if (!response.ok) {
      setActionError("新增菜單品項失敗。");
      return;
    }

    const payload = (await response.json()) as ApiDataResponse<MenuItem>;
    setItems((current) => [...current, payload.data]);
    setMenuDraft({
      name: "",
      price: "",
      category: "",
      description: "",
      image_url: "",
    });
  }

  async function deleteMenuItem(menuId: number): Promise<void> {
    const response = await fetch(buildApiUrl(`/api/menu/${menuId}`), {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      setActionError("刪除菜單品項失敗。");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== menuId));
  }

  async function updateOrderStatus(
    orderId: number,
    status: Exclude<OrderStatus, "pending">,
  ): Promise<void> {
    const response = await fetch(buildApiUrl(`/api/orders/${orderId}/status`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setActionError("更新訂單狀態失敗。");
      return;
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    setAllOrders((current) =>
      current.map((order) => (order.id === orderId ? payload.data : order)),
    );
  }

  async function reviewRoleRequest(
    requestId: number,
    status: "approved" | "rejected",
  ): Promise<void> {
    const response = await fetch(
      buildApiUrl(`/api/admin/role-requests/${requestId}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      },
    );

    if (!response.ok) {
      setActionError("審核角色申請失敗。");
      return;
    }

    await loadOperationsData();
  }

  async function setUserRoles(targetUser: AdminUser, mode: "add" | "reset") {
    const selectedRole = selectedRoleByUserId[targetUser.id] ?? "customer";
    const roles =
      mode === "reset"
        ? [selectedRole]
        : Array.from(new Set([...targetUser.roles, selectedRole]));

    const response = await fetch(
      buildApiUrl(`/api/admin/users/${targetUser.id}/roles`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roles }),
      },
    );

    if (!response.ok) {
      setActionError("更新使用者角色失敗。");
      return;
    }

    await loadOperationsData();
  }

  function orderStatusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
      pending: "購物車",
      submitted: "待處理",
      preparing: "製作中",
      ready: "可取餐",
      completed: "已完成",
      cancelled: "已取消",
    };
    return labels[status];
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error m-4">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-lg flex-col items-stretch gap-2 md:flex-row md:items-center">
        <div className="flex-1 w-full md:w-auto">
          <button
            className="btn btn-ghost normal-case text-2xl"
            onClick={() => {
              navigateTo("/");
            }}
          >
            🌅 聯大資工早餐菜單
          </button>
        </div>
        <div className="flex-none w-full md:w-auto">
          <div className="flex flex-wrap gap-2 items-center md:justify-end">
            <div className="badge badge-outline">
              {user ? `已登入 ${user.name}` : "尚未登入"}
            </div>
            {user ? (
              <div className="badge badge-info">
                {userRoles.map((role) => role.toUpperCase()).join(" / ")}
              </div>
            ) : null}
            <div className="badge badge-primary">
              {items.length} 個品項・{grouped.categories.length} 類
            </div>
            {isCustomerRoute ? (
              <>
                <div className="badge badge-secondary">
                  購物車 {cartItemCount} 件
                </div>
                <div className="badge badge-accent">總計 ${cartTotal}</div>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    setIsCartOpen(true);
                  }}
                  disabled={!user}
                >
                  購物車明細
                </button>
              </>
            ) : null}
            {user ? (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigateTo("/role-request");
                }}
              >
                角色申請
              </button>
            ) : null}
            {canAccessCounter ? (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigateTo("/counter");
                }}
              >
                櫃台
              </button>
            ) : null}
            {canAccessKitchen ? (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigateTo("/kitchen");
                }}
              >
                廚房
              </button>
            ) : null}
            {canAccessOwner ? (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigateTo("/owner");
                }}
              >
                店長
              </button>
            ) : null}
            {isAdmin ? (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigateTo("/admin");
                }}
              >
                管理
              </button>
            ) : null}
            {user ? (
              <button
                className="btn btn-sm"
                onClick={() => {
                  void handleLogout();
                }}
              >
                登出
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <main className="container mx-auto p-6">
        {!user ? (
          <section className="max-w-xl mx-auto card bg-base-100 shadow-md mb-8">
            <div className="card-body">
              <h2 className="card-title">使用 Google 帳號登入</h2>
              <p className="text-sm opacity-70">
                點擊下方按鈕，使用您的 Google 帳號登入後即可開始點餐。
              </p>
              {authError ? (
                <div className="alert alert-error">
                  <span>{authError}</span>
                </div>
              ) : null}
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void handleGoogleSignIn();
                }}
                disabled={isGoogleSigningIn}
              >
                {isGoogleSigningIn ? "導向 Google 中..." : "使用 Google 登入"}
              </button>
            </div>
          </section>
        ) : null}

        {actionError ? (
          <div className="alert alert-warning mb-4">
            <span>{actionError}</span>
          </div>
        ) : null}

        {!canAccessCurrentRoute ? (
          <section className="max-w-xl mx-auto card bg-base-100 shadow-sm mb-8">
            <div className="card-body">
              <h2 className="card-title">沒有此分支權限</h2>
              <p className="text-sm opacity-70">
                請切換到您的角色可使用的頁面，或先提交角色申請。
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  navigateTo("/");
                }}
              >
                回到一般點餐
              </button>
            </div>
          </section>
        ) : null}

        {user && isRoleRequestRoute ? (
          <section className="max-w-xl mx-auto card bg-base-100 shadow-sm mb-8">
            <div className="card-body">
              <h2 className="card-title">角色申請</h2>
              <div className="grid gap-3">
                <select
                  className="select select-bordered"
                  value={roleRequestRole}
                  onChange={(event) => {
                    setRoleRequestRole(event.target.value as "staff" | "chef");
                  }}
                >
                  <option value="staff">店員</option>
                  <option value="chef">廚師</option>
                </select>
                <textarea
                  className="textarea textarea-bordered min-h-24"
                  value={roleRequestReason}
                  onChange={(event) => {
                    setRoleRequestReason(event.target.value);
                  }}
                  placeholder="申請原因"
                />
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    void submitRoleRequest();
                  }}
                  disabled={roleRequestReason.trim().length < 10}
                >
                  送出申請
                </button>
                {roleRequestMessage ? (
                  <div className="alert">
                    <span>{roleRequestMessage}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {canAccessCurrentRoute && canViewOperations && isOperationsRoute ? (
          <section className="mb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="text-2xl font-bold">{operationsTitle}</h2>
                <p className="text-sm opacity-70 mt-1">
                  {operationsDescription}
                </p>
              </div>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  void loadOperationsData();
                }}
                disabled={operationsLoading}
              >
                {operationsLoading ? "更新中..." : "重新整理"}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="stat bg-base-100 rounded-lg shadow-sm">
                <div className="stat-title">
                  {roleView === "chef" ? "廚房佇列" : "可見訂單"}
                </div>
                <div className="stat-value text-primary">
                  {submittedOrders.length}
                </div>
              </div>
              <div className="stat bg-base-100 rounded-lg shadow-sm">
                <div className="stat-title">
                  {roleView === "chef"
                    ? "製作中"
                    : roleView === "staff"
                      ? "可取餐"
                      : "營收"}
                </div>
                {roleView === "chef" ? (
                  <div className="stat-value text-warning">
                    {statusCounts.preparing ?? 0}
                  </div>
                ) : roleView === "staff" ? (
                  <div className="stat-value text-info">
                    {statusCounts.ready ?? 0}
                  </div>
                ) : (
                  <div className="stat-value text-success">
                    ${salesSummary.totalRevenue}
                  </div>
                )}
              </div>
              <div className="stat bg-base-100 rounded-lg shadow-sm">
                <div className="stat-title">
                  {roleView === "chef"
                    ? "待處理"
                    : roleView === "staff"
                      ? "已完成"
                      : "熱門品項"}
                </div>
                <div className="stat-desc">
                  {roleView === "chef"
                    ? `${statusCounts.submitted ?? 0} 張待開始`
                    : roleView === "staff"
                      ? `${statusCounts.completed ?? 0} 張已完成`
                      : salesSummary.topItems.length > 0
                        ? salesSummary.topItems
                            .map((item) => `${item.name} x${item.qty}`)
                            .join("、")
                        : "尚無資料"}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto bg-base-100 rounded-lg shadow-sm">
              <table className="table">
                <thead>
                  <tr>
                    <th>訂單</th>
                    <th>狀態</th>
                    <th>內容</th>
                    {roleView !== "chef" ? <th>金額</th> : null}
                    <th>處理</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedOrders.map((order) => (
                    <tr key={order.id}>
                      <td>#{order.id}</td>
                      <td>
                        <span className="badge">
                          {orderStatusLabel(order.status)}
                        </span>
                      </td>
                      <td>
                        {order.items
                          .map((detail) => `${detail.item.name} x${detail.qty}`)
                          .join("、")}
                      </td>
                      {roleView !== "chef" ? <td>${order.total}</td> : null}
                      <td>
                        {canUpdateOrderStatus ? (
                          <select
                            className="select select-bordered select-sm"
                            value={order.status}
                            onChange={(event) => {
                              void updateOrderStatus(
                                order.id,
                                event.target.value as Exclude<
                                  OrderStatus,
                                  "pending"
                                >,
                              );
                            }}
                          >
                            <option value="submitted">待處理</option>
                            <option value="preparing">製作中</option>
                            <option value="ready">可取餐</option>
                            <option value="completed">已完成</option>
                            <option value="cancelled">已取消</option>
                          </select>
                        ) : (
                          <span className="text-sm opacity-60">唯讀</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {submittedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={roleView === "chef" ? 4 : 5}>
                        {roleView === "chef"
                          ? "目前沒有需要製作的訂單。"
                          : "目前沒有送出的訂單。"}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {canAccessCurrentRoute && canManageMenu && (isOwnerRoute || isAdminRoute) ? (
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">菜單管理</h2>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
              <div className="card bg-base-100 shadow-sm">
                <div className="card-body">
                  <h3 className="card-title">新增品項</h3>
                  <input
                    className="input input-bordered"
                    value={menuDraft.name}
                    onChange={(event) =>
                      setMenuDraft((draft) => ({
                        ...draft,
                        name: event.target.value,
                      }))
                    }
                    placeholder="品名"
                  />
                  <input
                    className="input input-bordered"
                    value={menuDraft.price}
                    onChange={(event) =>
                      setMenuDraft((draft) => ({
                        ...draft,
                        price: event.target.value,
                      }))
                    }
                    placeholder="價格"
                  />
                  <input
                    className="input input-bordered"
                    value={menuDraft.category}
                    onChange={(event) =>
                      setMenuDraft((draft) => ({
                        ...draft,
                        category: event.target.value,
                      }))
                    }
                    placeholder="分類"
                  />
                  <textarea
                    className="textarea textarea-bordered"
                    value={menuDraft.description}
                    onChange={(event) =>
                      setMenuDraft((draft) => ({
                        ...draft,
                        description: event.target.value,
                      }))
                    }
                    placeholder="描述"
                  />
                  <input
                    className="input input-bordered"
                    value={menuDraft.image_url}
                    onChange={(event) =>
                      setMenuDraft((draft) => ({
                        ...draft,
                        image_url: event.target.value,
                      }))
                    }
                    placeholder="圖片網址"
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      void createMenuItem();
                    }}
                  >
                    新增
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto bg-base-100 rounded-lg shadow-sm">
                <table className="table">
                  <thead>
                    <tr>
                      <th>品項</th>
                      <th>分類</th>
                      <th>價格</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td>${item.price}</td>
                        <td>
                          <button
                            className="btn btn-xs btn-error btn-outline"
                            onClick={() => {
                              void deleteMenuItem(item.id);
                            }}
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {canAccessCurrentRoute && isAdmin && isAdminRoute ? (
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">系統管理</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-base-100 rounded-lg shadow-sm overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>申請人</th>
                      <th>角色</th>
                      <th>狀態</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleRequests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <div className="font-medium">
                            {request.userName ?? request.userId}
                          </div>
                          <div className="text-xs opacity-60">
                            {request.reason}
                          </div>
                        </td>
                        <td>{request.requestedRole}</td>
                        <td>{request.status}</td>
                        <td>
                          {request.status === "pending" ? (
                            <div className="flex gap-2">
                              <button
                                className="btn btn-xs btn-success"
                                onClick={() => {
                                  void reviewRoleRequest(
                                    request.id,
                                    "approved",
                                  );
                                }}
                              >
                                通過
                              </button>
                              <button
                                className="btn btn-xs btn-error btn-outline"
                                onClick={() => {
                                  void reviewRoleRequest(
                                    request.id,
                                    "rejected",
                                  );
                                }}
                              >
                                拒絕
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-base-100 rounded-lg shadow-sm overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>使用者</th>
                      <th>角色</th>
                      <th>調整</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((adminUser) => (
                      <tr key={adminUser.id}>
                        <td>
                          <div className="font-medium">{adminUser.name}</div>
                          <div className="text-xs opacity-60">
                            {adminUser.email}
                          </div>
                        </td>
                        <td>{adminUser.roles.join(", ")}</td>
                        <td>
                          <div className="flex gap-2 flex-wrap">
                            <select
                              className="select select-bordered select-xs"
                              value={
                                selectedRoleByUserId[adminUser.id] ??
                                "customer"
                              }
                              onChange={(event) => {
                                setSelectedRoleByUserId((current) => ({
                                  ...current,
                                  [adminUser.id]: event.target.value as Role,
                                }));
                              }}
                            >
                              <option value="customer">customer</option>
                              <option value="staff">staff</option>
                              <option value="chef">chef</option>
                              <option value="owner">owner</option>
                              <option value="admin">admin</option>
                            </select>
                            <button
                              className="btn btn-xs"
                              onClick={() => {
                                void setUserRoles(adminUser, "add");
                              }}
                            >
                              加入
                            </button>
                            <button
                              className="btn btn-xs btn-outline"
                              onClick={() => {
                                void setUserRoles(adminUser, "reset");
                              }}
                            >
                              重設
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {canAccessCurrentRoute && isCustomerRoute && items.length === 0 ? (
          <div className="alert alert-info">
            <span>目前沒有菜單資料</span>
          </div>
        ) : canAccessCurrentRoute && isCustomerRoute ? (
          grouped.categories.map((category) => (
            <div key={category} className="mb-8">
              <h2 className="text-3xl font-bold mb-4 text-primary border-b-2 border-primary pb-2">
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(grouped.groupedItems[category] || []).map((item) => (
                  <div
                    key={item.id}
                    className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow"
                  >
                    <figure className="h-44 overflow-hidden bg-base-300">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          const target = event.currentTarget;
                          target.src =
                            "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80";
                        }}
                      />
                    </figure>
                    <div className="card-body">
                      <h3 className="card-title text-lg">{item.name}</h3>
                      <p className="text-sm opacity-80 line-clamp-2 min-h-[2.75rem]">
                        {item.description}
                      </p>
                      <div className="card-actions justify-between items-center">
                        <span className="text-xl font-bold text-success">
                          ${item.price}
                        </span>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            void addToCart(item);
                          }}
                          disabled={activeItemId === item.id}
                        >
                          {activeItemId === item.id
                            ? "加入中..."
                            : `加入購物車${cartQtyByItemId[item.id] ? ` (${cartQtyByItemId[item.id]})` : ""}`}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : null}

        {user && canAccessCurrentRoute && isCustomerRoute ? (
          <section className="mt-10">
            <h2 className="text-2xl font-bold mb-4">我的訂單歷史</h2>
            {historyLoading ? (
              <div className="alert">
                <span>讀取中...</span>
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="alert alert-info">
                <span>目前尚無歷史訂單。</span>
              </div>
            ) : (
              <div className="space-y-3">
                {historyOrders.map((order) => (
                  <article
                    key={order.id}
                    className="card bg-base-100 shadow-sm border border-base-300"
                  >
                    <div className="card-body p-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold">訂單 #{order.id}</h3>
                        <span className="badge badge-success">已送出</span>
                      </div>
                      <p className="text-sm opacity-70">
                        建立時間：{order.createdAt}
                      </p>
                      <ul className="text-sm list-disc pl-5 space-y-1">
                        {order.items.map((detail) => (
                          <li key={`${order.id}-${detail.item.id}`}>
                            {detail.item.name} x {detail.qty}
                          </li>
                        ))}
                      </ul>
                      <p className="font-bold text-right">
                        總額 ${order.total}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>

      {user && isCustomerRoute && isCartOpen ? (
        <>
          <button
            className="fixed inset-0 bg-black/35"
            aria-label="close cart drawer"
            onClick={() => {
              setIsCartOpen(false);
            }}
          />
          <aside className="fixed right-0 top-0 h-full w-full max-w-md bg-base-100 shadow-2xl z-10 flex flex-col">
            <div className="p-4 border-b border-base-300 flex items-center justify-between">
              <h2 className="text-xl font-bold">購物車明細</h2>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setIsCartOpen(false);
                }}
              >
                關閉
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              {cartDetails.length === 0 ? (
                <div className="alert">
                  <span>購物車目前是空的。</span>
                </div>
              ) : (
                <ul className="space-y-3">
                  {cartDetails.map((detail) => (
                    <li
                      key={detail.itemId}
                      className="p-3 rounded-lg bg-base-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold">{detail.item.name}</p>
                        <p className="text-sm opacity-70">
                          單價 ${detail.item.price} x {detail.qty}
                        </p>
                      </div>
                      <p className="font-bold">${detail.subtotal}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-base-300 space-y-3">
              <div className="flex items-center justify-between font-semibold">
                <span>總件數</span>
                <span>{cartItemCount}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold">
                <span>總金額</span>
                <span>${cartTotal}</span>
              </div>
              <button
                className="btn btn-error btn-outline w-full"
                onClick={() => {
                  void clearCart();
                }}
                disabled={cartDetails.length === 0 || isClearingCart}
              >
                {isClearingCart ? "清空中..." : "清空購物車"}
              </button>
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void submitOrder();
                }}
                disabled={cartDetails.length === 0 || isSubmittingOrder}
              >
                {isSubmittingOrder ? "送出中..." : "送出訂單"}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
