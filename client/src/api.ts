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

export async function fetchItems() {
  return json<{ items: Item[] }>(fetch("/api/items"));
}

export async function fetchBuyers() {
  return json<{ buyers: Buyer[]; heavyBuyers: Buyer[] }>(fetch("/api/buyers"));
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
  return json<{ items: Item[] }>(adminFetch("/api/admin/items"));
}

export async function adminSaveItem(
  item: Partial<Item> & {
    name: string;
    price: number;
    stock: number;
    isActive: boolean;
    displayOrder: number;
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
        price: item.price,
        stock: item.stock,
        isActive: item.isActive,
        imageUrl: item.imageUrl ?? null,
        displayOrder: item.displayOrder,
        alertEnabled: item.alertEnabled,
        alertThreshold: item.alertThreshold,
        alertCondition: item.alertCondition,
      }),
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
        isActive: buyer.isActive,
      }),
    })
  );
}

export async function adminPurchases(date: string) {
  return json<{ date: string; purchases: PurchaseDetail[] }>(
    adminFetch(`/api/admin/purchases?date=${encodeURIComponent(date)}`)
  );
}

export async function adminStats(date: string) {
  return json<{
    date: string;
    stats: {
      byPayment: { PAYPAY: number; CASH: number };
      anonymousCount: number;
      namedCount: number;
      byItem: { itemId: string; name: string; quantity: number }[];
    };
  }>(adminFetch(`/api/admin/stats?date=${encodeURIComponent(date)}`));
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
