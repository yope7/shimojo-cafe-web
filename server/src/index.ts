import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addAdminOperationLog,
  addStockEvent,
  cancelPurchase,
  completePurchase,
  getPurchase,
  getSetting,
  listAdminOperationLogs,
  listAllBuyers,
  listAllItems,
  listHeavyBuyersForSale,
  listBuyersForSale,
  listItemsForSale,
  listPurchasesByDate,
  listStockAlerts,
  listStockEvents,
  openDb,
  setSetting,
  statsForDate,
  insertSupplyRequest,
  listSupplyRequests,
  updateSupplyRequestStatus,
  upsertBuyer,
  upsertItem,
} from "./db.js";
import { adminLoginHandler, adminLogout, requireAdmin } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = openDb();
const app = express();
const PORT = Number(process.env.PORT ?? 8787);
const TERMINAL_ID = process.env.TERMINAL_ID ?? "tablet-1";

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

function adminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD ?? getSetting(db, "admin_password");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, terminalId: TERMINAL_ID });
});

app.get("/api/settings", (_req, res) => {
  res.json({
    paypayInstruction: getSetting(db, "paypay_instruction") ?? "",
    cashInstruction: getSetting(db, "cash_instruction") ?? "",
    terminalId: TERMINAL_ID,
  });
});

app.get("/api/items", (_req, res) => {
  res.json({ items: listItemsForSale(db) });
});

app.get("/api/buyers", (_req, res) => {
  res.json({ buyers: listBuyersForSale(db), heavyBuyers: listHeavyBuyersForSale(db, 7, 5) });
});

app.post("/api/supply-requests", (req, res) => {
  const body = req.body as { body?: string; requesterName?: string; source?: string };
  try {
    const result = insertSupplyRequest(db, {
      body: body.body ?? "",
      requesterName: body.requesterName ?? "",
      source: body.source === "mobile" ? "mobile" : "pos",
    });
    res.status(201).json(result);
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    if (code === "INVALID_SUPPLY_REQUEST") {
      res.status(400).json({ error: code });
      return;
    }
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/purchases", (req, res) => {
  const body = req.body as {
    lines?: { itemId: string; quantity: number }[];
    paymentMethod?: string;
    buyerType?: string;
    buyerId?: string | null;
    terminalId?: string;
  };
  try {
    const lines = body.lines ?? [];
    const pm = body.paymentMethod === "CASH" ? "CASH" : "PAYPAY";
    const bt = body.buyerType === "ANONYMOUS" ? "ANONYMOUS" : "NAMED";
    const buyerId = bt === "NAMED" ? (body.buyerId ?? null) : null;
    const tid = body.terminalId ?? TERMINAL_ID;
    const result = completePurchase(db, lines, pm, bt, buyerId, tid);
    const summary = getPurchase(db, result.purchaseId);
    res.status(201).json({ purchase: summary });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    if (code === "INSUFFICIENT_STOCK") {
      res.status(409).json({ error: code, message: "在庫が不足しています。商品一覧に戻ってください。" });
      return;
    }
    if (code === "EMPTY_CART" || code === "BAD_QUANTITY" || code === "ITEM_NOT_FOUND" || code === "BUYER_REQUIRED") {
      res.status(400).json({ error: code });
      return;
    }
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/admin/login", adminLoginHandler(adminPassword));
app.post("/api/admin/logout", adminLogout);

app.get("/api/admin/items", requireAdmin, (_req, res) => {
  res.json({ items: listAllItems(db) });
});

app.put("/api/admin/items/:itemId", requireAdmin, (req, res) => {
  const param = String(req.params.itemId);
  const body = req.body as {
    name: string;
    price: number;
    stock: number;
    isActive: boolean;
    imageUrl: string | null;
    displayOrder: number;
    alertEnabled?: boolean;
    alertThreshold?: number;
    alertCondition?: "LTE" | "EQ";
  };
  const itemId = upsertItem(db, {
    itemId: param === "new" ? undefined : param,
    name: body.name,
    price: Math.floor(body.price),
    stock: Math.floor(body.stock),
    isActive: !!body.isActive,
    imageUrl: body.imageUrl ?? null,
    displayOrder: Math.floor(body.displayOrder ?? 0),
    alertEnabled: body.alertEnabled !== false,
    alertThreshold: Math.floor(body.alertThreshold ?? 3),
    alertCondition: body.alertCondition === "EQ" ? "EQ" : "LTE",
  });
  addAdminOperationLog(db, {
    action: "UPSERT_ITEM",
    targetType: "ITEM",
    targetId: itemId,
    detail: JSON.stringify({ name: body.name, stock: Math.floor(body.stock) }),
    actor: "admin",
  });
  res.json({ itemId });
});

app.post("/api/admin/items", requireAdmin, (req, res) => {
  const body = req.body as {
    name: string;
    price: number;
    stock: number;
    isActive: boolean;
    imageUrl: string | null;
    displayOrder: number;
    alertEnabled?: boolean;
    alertThreshold?: number;
    alertCondition?: "LTE" | "EQ";
  };
  const itemId = upsertItem(db, {
    name: body.name,
    price: Math.floor(body.price),
    stock: Math.floor(body.stock),
    isActive: !!body.isActive,
    imageUrl: body.imageUrl ?? null,
    displayOrder: Math.floor(body.displayOrder ?? 0),
    alertEnabled: body.alertEnabled !== false,
    alertThreshold: Math.floor(body.alertThreshold ?? 3),
    alertCondition: body.alertCondition === "EQ" ? "EQ" : "LTE",
  });
  addAdminOperationLog(db, {
    action: "CREATE_ITEM",
    targetType: "ITEM",
    targetId: itemId,
    detail: JSON.stringify({ name: body.name, stock: Math.floor(body.stock) }),
    actor: "admin",
  });
  res.json({ itemId });
});

app.get("/api/admin/buyers", requireAdmin, (_req, res) => {
  res.json({ buyers: listAllBuyers(db) });
});

app.put("/api/admin/buyers/:buyerId", requireAdmin, (req, res) => {
  const param = String(req.params.buyerId);
  const body = req.body as { name: string; photoUrl: string | null; isActive: boolean };
  const buyerId = upsertBuyer(db, {
    buyerId: param === "new" ? undefined : param,
    name: body.name,
    photoUrl: body.photoUrl ?? null,
    isActive: !!body.isActive,
  });
  addAdminOperationLog(db, {
    action: "UPSERT_BUYER",
    targetType: "BUYER",
    targetId: buyerId,
    detail: JSON.stringify({ name: body.name }),
    actor: "admin",
  });
  res.json({ buyerId });
});

app.post("/api/admin/buyers", requireAdmin, (req, res) => {
  const body = req.body as { name: string; photoUrl: string | null; isActive: boolean };
  const buyerId = upsertBuyer(db, {
    name: body.name,
    photoUrl: body.photoUrl ?? null,
    isActive: !!body.isActive,
  });
  addAdminOperationLog(db, {
    action: "CREATE_BUYER",
    targetType: "BUYER",
    targetId: buyerId,
    detail: JSON.stringify({ name: body.name }),
    actor: "admin",
  });
  res.json({ buyerId });
});

app.get("/api/admin/purchases", requireAdmin, (req, res) => {
  const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
  res.json({ date, purchases: listPurchasesByDate(db, date) });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
  res.json({ date, stats: statsForDate(db, date) });
});

app.get("/api/admin/stock-alerts", requireAdmin, (_req, res) => {
  res.json({ alerts: listStockAlerts(db) });
});

app.get("/api/admin/stock-events", requireAdmin, (req, res) => {
  const limit = Number(req.query.limit ?? 200);
  res.json({ events: listStockEvents(db, Number.isFinite(limit) ? limit : 200) });
});

app.post("/api/admin/stock-events", requireAdmin, (req, res) => {
  const body = req.body as { itemId?: string; eventType?: string; quantity?: number; note?: string };
  const eventType = body.eventType === "ADJUST" ? "ADJUST" : body.eventType === "REPLENISH" ? "REPLENISH" : null;
  if (!eventType || !body.itemId || !Number.isFinite(body.quantity)) {
    res.status(400).json({ error: "BAD_REQUEST" });
    return;
  }
  try {
    const result = addStockEvent(db, {
      itemId: body.itemId,
      eventType,
      quantity: Number(body.quantity),
      note: body.note,
      actor: "admin",
    });
    addAdminOperationLog(db, {
      action: "STOCK_EVENT",
      targetType: "ITEM",
      targetId: body.itemId,
      detail: JSON.stringify({ eventType, quantity: Number(body.quantity), note: body.note ?? null }),
      actor: "admin",
    });
    res.status(201).json(result);
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    if (code === "BAD_QUANTITY" || code === "ITEM_NOT_FOUND") {
      res.status(400).json({ error: code });
      return;
    }
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/admin/purchases/:purchaseId/cancel", requireAdmin, (req, res) => {
  try {
    const result = cancelPurchase(db, String(req.params.purchaseId), "admin");
    addAdminOperationLog(db, {
      action: "CANCEL_PURCHASE",
      targetType: "PURCHASE",
      targetId: String(req.params.purchaseId),
      detail: JSON.stringify(result),
      actor: "admin",
    });
    res.json(result);
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    if (code === "PURCHASE_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "ITEM_NOT_FOUND") {
      res.status(409).json({ error: code });
      return;
    }
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.get("/api/admin/supply-requests", requireAdmin, (_req, res) => {
  res.json({ requests: listSupplyRequests(db) });
});

app.patch("/api/admin/supply-requests/:requestId", requireAdmin, (req, res) => {
  const id = String(req.params.requestId);
  const body = req.body as { status?: string };
  const st = body.status === "DONE" ? "DONE" : body.status === "OPEN" ? "OPEN" : null;
  if (!st) {
    res.status(400).json({ error: "BAD_STATUS" });
    return;
  }
  const ok = updateSupplyRequestStatus(db, id, st);
  if (!ok) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  addAdminOperationLog(db, {
    action: "UPDATE_SUPPLY_REQUEST_STATUS",
    targetType: "SUPPLY_REQUEST",
    targetId: id,
    detail: JSON.stringify({ status: st }),
    actor: "admin",
  });
  res.json({ ok: true });
});

app.get("/api/admin/operation-logs", requireAdmin, (req, res) => {
  const limit = Number(req.query.limit ?? 300);
  res.json({ logs: listAdminOperationLogs(db, Number.isFinite(limit) ? limit : 300) });
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const body = req.body as { paypayInstruction?: string; cashInstruction?: string; adminPassword?: string };
  if (body.paypayInstruction !== undefined) setSetting(db, "paypay_instruction", body.paypayInstruction);
  if (body.cashInstruction !== undefined) setSetting(db, "cash_instruction", body.cashInstruction);
  if (body.adminPassword !== undefined && body.adminPassword.length > 0) {
    setSetting(db, "admin_password", body.adminPassword);
  }
  addAdminOperationLog(db, {
    action: "UPDATE_SETTINGS",
    targetType: "SETTINGS",
    detail: JSON.stringify({
      paypayInstruction: body.paypayInstruction !== undefined,
      cashInstruction: body.cashInstruction !== undefined,
      adminPassword: body.adminPassword !== undefined,
    }),
    actor: "admin",
  });
  res.json({ ok: true });
});

const distClient = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(distClient)) {
  app.use(express.static(distClient));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distClient, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT}`);
});
