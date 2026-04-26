import type { Buyer, Item } from "./types";

const json = async <T>(input: Response | Promise<Response>): Promise<T> => {
  const r = await input;
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP_${r.status}`);
  }
  return r.json() as Promise<T>;
};

export async function fetchSettings() {
  return json<{ paypayInstruction: string; cashInstruction: string; terminalId: string }>(
    fetch("/api/settings")
  );
}

export type Bestseller7d = { itemId: string; rank: number; quantitySold: number };

export async function fetchItems() {
  return json<{ items: Item[]; bestsellers7d: Bestseller7d[] }>(
    fetch("/api/items", { cache: "no-store" })
  );
}

export async function fetchBuyers() {
  return json<{
    buyers: Buyer[];
    heavyBuyers: Buyer[];
    weeklyBuyerUsage: { buyerId: string; purchaseCount: number; rank: number }[];
  }>(fetch("/api/buyers"));
}

export async function postPurchase(body: {
  lines: { itemId: string; quantity: number }[];
  paymentMethod: "PAYPAY" | "CASH";
  buyerType: "NAMED" | "ANONYMOUS";
  buyerId?: string | null;
  terminalId?: string;
}) {
  return json<{ purchase: PurchaseDetail }>(
    fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export type PurchaseDetail = {
  purchaseId: string;
  purchasedAt: string;
  totalPrice: number;
  paymentMethod: string;
  buyerType: string;
  buyerId: string | null;
  buyerName: string | null;
  terminalId: string;
  status: string;
  items: { itemId: string; name: string; quantity: number; unitPrice: number; subtotal: number }[];
};

const adminFetch = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "include" });

export async function adminLogin(password: string) {
  return json<{ ok: boolean }>(
    adminFetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
  );
}

export async function adminLogout() {
  return adminFetch("/api/admin/logout", { method: "POST" });
}

export async function adminItems() {
  return json<{ items: Item[] }>(adminFetch("/api/admin/items", { cache: "no-store" }));
}

export async function adminItemImages() {
  return json<{ images: string[] }>(adminFetch("/api/admin/item-images", { cache: "no-store" }));
}

export async function adminSaveItem(
  item: Partial<Item> & {
    name: string;
    costPrice: number;
    stock: number;
    isActive: boolean;
    displayOrder: number;
    category?: "DRINK" | "SNACK" | "OTHER";
    alertEnabled: boolean;
    alertThreshold: number;
    alertCondition: "LTE" | "EQ";
  }
) {
  const path = item.itemId ? `/api/admin/items/${item.itemId}` : "/api/admin/items";
  return json<{ itemId: string }>(
    adminFetch(path, {
      method: item.itemId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        costPrice: item.costPrice,
        price: item.price,
        stock: item.stock,
        isActive: item.isActive,
        imageUrl: item.imageUrl ?? null,
        displayOrder: item.displayOrder,
        category: item.category,
        alertEnabled: item.alertEnabled,
        alertThreshold: item.alertThreshold,
        alertCondition: item.alertCondition,
      }),
    })
  );
}

export async function adminBulkUpsertItems(
  items: Array<
    Partial<Item> & {
      name: string;
      costPrice: number;
      stock: number;
      isActive: boolean;
      displayOrder: number;
      category?: "DRINK" | "SNACK" | "OTHER";
      alertEnabled: boolean;
      alertThreshold: number;
      alertCondition: "LTE" | "EQ";
    }
  >
) {
  return json<{ updated: number }>(
    adminFetch("/api/admin/items/bulk-upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
  );
}

export async function adminBuyers() {
  return json<{ buyers: Buyer[] }>(adminFetch("/api/admin/buyers"));
}

export async function adminSaveBuyer(
  buyer: Partial<Buyer> & { name: string; isActive: boolean }
) {
  const path = buyer.buyerId ? `/api/admin/buyers/${buyer.buyerId}` : "/api/admin/buyers";
  return json<{ buyerId: string }>(
    adminFetch(path, {
      method: buyer.buyerId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: buyer.name,
        photoUrl: buyer.photoUrl ?? null,
        affiliation: buyer.affiliation ?? null,
        isActive: buyer.isActive,
      }),
    })
  );
}

export async function adminDeleteBuyer(buyerId: string) {
  return json<{ deleted: boolean }>(
    adminFetch(`/api/admin/buyers/${encodeURIComponent(buyerId)}`, {
      method: "DELETE",
    })
  );
}

export async function adminPurchases(limit: number = 20, offset: number = 0) {
  return json<{ purchases: PurchaseDetail[]; total: number; limit: number; offset: number }>(
    adminFetch(`/api/admin/purchases?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`)
  );
}

export type AdminStatsPreset = "all" | "today" | "7" | "30";

export async function adminStats(preset: AdminStatsPreset = "all") {
  return json<{
    preset: AdminStatsPreset;
    stats: {
      byPayment: { PAYPAY: number; CASH: number };
      anonymousCount: number;
      namedCount: number;
      byItem: { itemId: string; name: string; quantity: number }[];
    };
  }>(adminFetch(`/api/admin/stats?preset=${encodeURIComponent(preset)}`));
}

export type AdminMonitorResponse = {
  date: string;
  totalRevenue: number;
  metrics: {
    purchaseTotal: number;
    purchaseCount: number;
    canceledCount: number;
  };
  snapshot: {
    date: string;
    recordedPurchaseTotal: number;
    shippingFee: number;
    poolFund: number;
    note: string | null;
    updatedAt: string;
  } | null;
};

export async function adminMonitor(date: string) {
  return json<AdminMonitorResponse>(adminFetch(`/api/admin/monitor?date=${encodeURIComponent(date)}`));
}

export async function adminMonitorTimeline(days: number = 14) {
  return json<{
    points: Array<{
      date: string;
      purchaseTotal: number;
      purchaseCount: number;
      canceledCount: number;
      paypayCount: number;
      cashCount: number;
    }>;
  }>(adminFetch(`/api/admin/monitor/timeline?days=${encodeURIComponent(String(days))}`));
}

export async function adminMonitorAnalytics(days: number = 30) {
  return json<{
    days: number;
    timeline: Array<{
      date: string;
      purchaseTotal: number;
      purchaseCount: number;
      canceledCount: number;
      paypayCount: number;
      cashCount: number;
    }>;
    items: Array<{
      itemId: string;
      name: string;
      quantity: number;
      revenue: number;
      avgUnitPrice: number;
      currentPrice: number;
      stock: number;
    }>;
  }>(adminFetch(`/api/admin/monitor/analytics?days=${encodeURIComponent(String(days))}`));
}

export async function adminSaveMonitor(body: {
  date: string;
  recordedPurchaseTotal: number;
  shippingFee: number;
  poolFund: number;
  note?: string | null;
}) {
  return json<{ ok: boolean }>(
    adminFetch("/api/admin/monitor", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function adminApplyTaxToItems(ratePercent: number = 10) {
  return json<{ updated: number }>(
    adminFetch("/api/admin/items/apply-tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratePercent }),
    })
  );
}

export async function adminSettings(body: {
  paypayInstruction?: string;
  cashInstruction?: string;
  adminPassword?: string;
}) {
  return json<{ ok: boolean }>(
    adminFetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export type SupplyRequest = {
  requestId: string;
  body: string;
  requesterName: string;
  createdAt: string;
  source: string;
  status: string;
};

export async function postSupplyRequest(body: {
  body: string;
  requesterName: string;
  source: "pos" | "mobile";
}) {
  return json<{ requestId: string }>(
    fetch("/api/supply-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function postItemFeedback(body: {
  itemId: string;
  feedbackType: "LIKE";
  source: "pos" | "mobile";
}) {
  return json<{ feedbackId: string }>(
    fetch("/api/item-feedbacks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function postFeedback(body: {
  body: string;
  senderName?: string;
  source: "pos" | "mobile";
}) {
  return json<{ feedbackMessageId: string }>(
    fetch("/api/feedbacks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function adminSupplyRequests() {
  return json<{ requests: SupplyRequest[] }>(adminFetch("/api/admin/supply-requests"));
}

export async function adminUpdateSupplyRequest(requestId: string, status: "OPEN" | "DONE") {
  return json<{ ok: boolean }>(
    adminFetch(`/api/admin/supply-requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
  );
}

export type StockEvent = {
  stockEventId: string;
  itemId: string;
  itemName: string;
  eventType: "PURCHASE" | "CANCEL" | "REPLENISH" | "ADJUST";
  delta: number;
  beforeStock: number;
  afterStock: number;
  note: string | null;
  actor: string;
  createdAt: string;
};

export async function adminStockAlerts() {
  return json<{ alerts: (Item & { isAlerting: boolean })[] }>(adminFetch("/api/admin/stock-alerts"));
}

export async function adminStockEvents(limit: number = 200) {
  return json<{ events: StockEvent[] }>(adminFetch(`/api/admin/stock-events?limit=${encodeURIComponent(String(limit))}`));
}

export async function adminCreateStockEvent(body: {
  itemId: string;
  eventType: "REPLENISH" | "ADJUST";
  quantity: number;
  note?: string;
}) {
  return json<{ stockEventId: string }>(
    adminFetch("/api/admin/stock-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function adminCancelPurchase(purchaseId: string) {
  return json<{ canceled: boolean }>(
    adminFetch(`/api/admin/purchases/${encodeURIComponent(purchaseId)}/cancel`, {
      method: "POST",
    })
  );
}

export async function adminDeletePurchase(purchaseId: string) {
  return json<{ deleted: boolean; restoredStock: boolean }>(
    adminFetch(`/api/admin/purchases/${encodeURIComponent(purchaseId)}`, {
      method: "DELETE",
    })
  );
}

export type OperationLog = {
  operationId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: string | null;
  actor: string;
  createdAt: string;
};

export async function adminOperationLogs(limit: number = 300) {
  return json<{ logs: OperationLog[] }>(
    adminFetch(`/api/admin/operation-logs?limit=${encodeURIComponent(String(limit))}`)
  );
}

export async function adminItemFeedbacks(days: number = 30, limit: number = 80) {
  return json<{
    summary: Array<{ itemId: string; name: string; likeCount: number; lastFeedbackAt: string | null }>;
    recent: Array<{
      feedbackId: string;
      itemId: string;
      itemName: string;
      feedbackType: "LIKE";
      source: string;
      createdAt: string;
    }>;
  }>(
    adminFetch(
      `/api/admin/item-feedbacks?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`
    )
  );
}

export type FeedbackMessage = {
  feedbackMessageId: string;
  body: string;
  senderName: string | null;
  source: string;
  createdAt: string;
  status: "OPEN" | "DONE";
};

export async function adminFeedbacks(limit: number = 200) {
  return json<{ messages: FeedbackMessage[] }>(
    adminFetch(`/api/admin/feedbacks?limit=${encodeURIComponent(String(limit))}`)
  );
}

export async function adminUpdateFeedbackStatus(feedbackMessageId: string, status: "OPEN" | "DONE") {
  return json<{ ok: boolean }>(
    adminFetch(`/api/admin/feedbacks/${encodeURIComponent(feedbackMessageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
  );
}
