import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.SQLITE_PATH ?? path.join(__dirname, "..", "data", "cafe.db");

export function openDb(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedIfEmpty(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      item_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      alert_enabled INTEGER NOT NULL DEFAULT 1,
      alert_threshold INTEGER NOT NULL DEFAULT 3,
      alert_condition TEXT NOT NULL DEFAULT 'LTE'
    );

    CREATE TABLE IF NOT EXISTS buyers (
      buyer_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      photo_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS purchases (
      purchase_id TEXT PRIMARY KEY,
      purchased_at TEXT NOT NULL,
      total_price INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      buyer_type TEXT NOT NULL,
      buyer_id TEXT,
      terminal_id TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (buyer_id) REFERENCES buyers(buyer_id)
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      purchase_item_id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(purchase_id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchased_at);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

    CREATE TABLE IF NOT EXISTS supply_requests (
      request_id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'pos',
      status TEXT NOT NULL DEFAULT 'OPEN'
    );

    CREATE INDEX IF NOT EXISTS idx_supply_requests_created ON supply_requests(created_at);

    CREATE TABLE IF NOT EXISTS stock_events (
      stock_event_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      delta INTEGER NOT NULL,
      before_stock INTEGER NOT NULL,
      after_stock INTEGER NOT NULL,
      note TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_events_created ON stock_events(created_at);

    CREATE TABLE IF NOT EXISTS admin_operation_logs (
      operation_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      detail TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_admin_operation_logs_created ON admin_operation_logs(created_at);
  `);

  // Existing DB migration for older schema.
  ensureColumn(db, "items", "alert_enabled INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "items", "alert_threshold INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "items", "alert_condition TEXT NOT NULL DEFAULT 'LTE'");
}

function ensureColumn(db: Database.Database, table: string, columnDef: string) {
  const sql = `ALTER TABLE ${table} ADD COLUMN ${columnDef}`;
  try {
    db.exec(sql);
  } catch {
    // Ignore duplicate-column errors on subsequent startups.
  }
}

function seedIfEmpty(db: Database.Database) {
  const row = db.prepare("SELECT COUNT(*) as c FROM items").get() as { c: number };
  if (row.c > 0) return;

  const defaults: [string, string][] = [
    ["paypay_instruction", "PayPayで送金してください。送金先: @shimojo_cafe（例）"],
    ["cash_instruction", "現金は研究室の貯金箱へお願いします。"],
    ["admin_password", "admin"],
  ];
  const ins = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of defaults) ins.run(k, v);

  const items = Array.from({ length: 30 }, (_, idx) => {
    const i = idx + 1;
    return {
      name: `ダミー商品${String(i).padStart(2, "0")}`,
      price: 80 + (i % 8) * 20,
      stock: 8 + (i % 7),
      order: i,
    };
  });
  const insItem = db.prepare(
    `INSERT INTO items (item_id, name, price, stock, is_active, image_url, display_order)
     VALUES (?, ?, ?, ?, 1, NULL, ?)`
  );
  for (const it of items) {
    insItem.run(nanoid(), it.name, it.price, it.stock, it.order);
  }

  const buyers = Array.from({ length: 30 }, (_, idx) => ({
    name: `ダミーユーザ${String(idx + 1).padStart(2, "0")}`,
  }));
  const insBuyer = db.prepare(
    `INSERT INTO buyers (buyer_id, name, photo_url, is_active) VALUES (?, ?, NULL, 1)`
  );
  for (const b of buyers) insBuyer.run(nanoid(), b.name);
}

export type ItemRow = {
  itemId: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
  displayOrder: number;
  alertEnabled: boolean;
  alertThreshold: number;
  alertCondition: "LTE" | "EQ";
};

export type BuyerRow = {
  buyerId: string;
  name: string;
  photoUrl: string | null;
  isActive: boolean;
};

function normItem(r: Record<string, unknown>): ItemRow {
  return {
    itemId: String(r.itemId),
    name: String(r.name),
    price: Number(r.price),
    stock: Number(r.stock),
    isActive: Boolean(r.isActive),
    imageUrl: r.imageUrl == null ? null : String(r.imageUrl),
    displayOrder: Number(r.displayOrder),
    alertEnabled: Boolean(r.alertEnabled),
    alertThreshold: Number(r.alertThreshold ?? 0),
    alertCondition: String(r.alertCondition) === "EQ" ? "EQ" : "LTE",
  };
}

export function listItemsForSale(db: Database.Database): ItemRow[] {
  const rows = db
    .prepare(
      `SELECT item_id as itemId, name, price, stock,
              is_active as isActive, image_url as imageUrl, display_order as displayOrder,
              alert_enabled as alertEnabled, alert_threshold as alertThreshold, alert_condition as alertCondition
       FROM items WHERE is_active = 1 ORDER BY display_order ASC, name ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(normItem);
}

export function listAllItems(db: Database.Database): ItemRow[] {
  const rows = db
    .prepare(
      `SELECT item_id as itemId, name, price, stock,
              is_active as isActive, image_url as imageUrl, display_order as displayOrder,
              alert_enabled as alertEnabled, alert_threshold as alertThreshold, alert_condition as alertCondition
       FROM items ORDER BY display_order ASC, name ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(normItem);
}

function normBuyer(r: Record<string, unknown>): BuyerRow {
  return {
    buyerId: String(r.buyerId),
    name: String(r.name),
    photoUrl: r.photoUrl == null ? null : String(r.photoUrl),
    isActive: Boolean(r.isActive),
  };
}

export function listBuyersForSale(db: Database.Database): BuyerRow[] {
  const rows = db
    .prepare(
      `SELECT buyer_id as buyerId, name, photo_url as photoUrl, is_active as isActive
       FROM buyers WHERE is_active = 1 ORDER BY name ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(normBuyer);
}

export function listHeavyBuyersForSale(db: Database.Database, days: number = 7, limit: number = 5): BuyerRow[] {
  const from = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT b.buyer_id as buyerId, b.name, b.photo_url as photoUrl, b.is_active as isActive
       FROM buyers b
       JOIN (
         SELECT p.buyer_id as buyerId, COUNT(*) as purchaseCount, MAX(p.purchased_at) as lastPurchasedAt
         FROM purchases p
         WHERE p.status = 'COMPLETED'
           AND p.buyer_type = 'NAMED'
           AND p.buyer_id IS NOT NULL
           AND p.purchased_at >= ?
         GROUP BY p.buyer_id
         ORDER BY purchaseCount DESC, lastPurchasedAt DESC
         LIMIT ?
       ) heavy ON heavy.buyerId = b.buyer_id
       WHERE b.is_active = 1
       ORDER BY b.name ASC`
    )
    .all(from, Math.max(1, limit)) as Record<string, unknown>[];
  return rows.map(normBuyer);
}

export function listAllBuyers(db: Database.Database): BuyerRow[] {
  const rows = db
    .prepare(
      `SELECT buyer_id as buyerId, name, photo_url as photoUrl, is_active as isActive
       FROM buyers ORDER BY name ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(normBuyer);
}

export function getSetting(db: Database.Database, key: string): string | undefined {
  const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value;
}

export function setSetting(db: Database.Database, key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value
  );
}

export type CartLine = { itemId: string; quantity: number };

export function completePurchase(
  db: Database.Database,
  lines: CartLine[],
  paymentMethod: "PAYPAY" | "CASH",
  buyerType: "NAMED" | "ANONYMOUS",
  buyerId: string | null,
  terminalId: string
): { purchaseId: string } {
  if (lines.length === 0) throw new Error("EMPTY_CART");
  if (buyerType === "NAMED" && !buyerId) throw new Error("BUYER_REQUIRED");

  const purchaseId = nanoid();
  const now = new Date().toISOString();

  const getItem = db.prepare(
    `SELECT item_id as itemId, name, price, stock FROM items WHERE item_id = ? AND is_active = 1`
  );

  const tx = db.transaction(() => {
    let total = 0;
    const preparedLines: { itemId: string; quantity: number; unitPrice: number; subtotal: number }[] = [];

    for (const line of lines) {
      if (line.quantity <= 0) throw new Error("BAD_QUANTITY");
      const row = getItem.get(line.itemId) as { itemId: string; name: string; price: number; stock: number } | undefined;
      if (!row) throw new Error("ITEM_NOT_FOUND");
      if (row.stock < line.quantity) throw new Error("INSUFFICIENT_STOCK");
      const subtotal = row.price * line.quantity;
      total += subtotal;
      preparedLines.push({
        itemId: row.itemId,
        quantity: line.quantity,
        unitPrice: row.price,
        subtotal,
      });
    }

    db.prepare(
      `INSERT INTO purchases (purchase_id, purchased_at, total_price, payment_method, buyer_type, buyer_id, terminal_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`
    ).run(purchaseId, now, total, paymentMethod, buyerType, buyerId, terminalId);

    const insPi = db.prepare(
      `INSERT INTO purchase_items (purchase_item_id, purchase_id, item_id, quantity, unit_price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const decStock = db.prepare(`UPDATE items SET stock = stock - ? WHERE item_id = ? AND stock >= ?`);
    const getStock = db.prepare(`SELECT stock FROM items WHERE item_id = ?`);
    const insStockEvent = db.prepare(
      `INSERT INTO stock_events (stock_event_id, item_id, event_type, delta, before_stock, after_stock, note, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const pl of preparedLines) {
      const before = (getStock.get(pl.itemId) as { stock: number } | undefined)?.stock;
      if (before === undefined) throw new Error("ITEM_NOT_FOUND");
      insPi.run(nanoid(), purchaseId, pl.itemId, pl.quantity, pl.unitPrice, pl.subtotal);
      const r = decStock.run(pl.quantity, pl.itemId, pl.quantity);
      if (r.changes !== 1) throw new Error("INSUFFICIENT_STOCK");
      const after = before - pl.quantity;
      insStockEvent.run(
        nanoid(),
        pl.itemId,
        "PURCHASE",
        -pl.quantity,
        before,
        after,
        `purchase:${purchaseId}`,
        "system",
        now
      );
    }
  });

  tx();
  return { purchaseId };
}

export function upsertItem(
  db: Database.Database,
  data: {
    itemId?: string;
    name: string;
    price: number;
    stock: number;
    isActive: boolean;
    imageUrl: string | null;
    displayOrder: number;
    alertEnabled?: boolean;
    alertThreshold?: number;
    alertCondition?: "LTE" | "EQ";
  }
): string {
  const id = data.itemId && data.itemId.length > 0 ? data.itemId : nanoid();
  const alertThreshold = Math.max(0, Math.floor(data.alertThreshold ?? 3));
  const alertCondition = data.alertCondition === "EQ" ? "EQ" : "LTE";
  db.prepare(
    `INSERT INTO items (item_id, name, price, stock, is_active, image_url, display_order, alert_enabled, alert_threshold, alert_condition)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       name = excluded.name,
       price = excluded.price,
       stock = excluded.stock,
       is_active = excluded.is_active,
       image_url = excluded.image_url,
       display_order = excluded.display_order,
       alert_enabled = excluded.alert_enabled,
       alert_threshold = excluded.alert_threshold,
       alert_condition = excluded.alert_condition`
  ).run(
    id,
    data.name,
    data.price,
    data.stock,
    data.isActive ? 1 : 0,
    data.imageUrl,
    data.displayOrder,
    data.alertEnabled === false ? 0 : 1,
    alertThreshold,
    alertCondition
  );
  return id;
}

export function upsertBuyer(
  db: Database.Database,
  data: { buyerId?: string; name: string; photoUrl: string | null; isActive: boolean }
): string {
  const id = data.buyerId && data.buyerId.length > 0 ? data.buyerId : nanoid();
  db.prepare(
    `INSERT INTO buyers (buyer_id, name, photo_url, is_active)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(buyer_id) DO UPDATE SET
       name = excluded.name,
       photo_url = excluded.photo_url,
       is_active = excluded.is_active`
  ).run(id, data.name, data.photoUrl, data.isActive ? 1 : 0);
  return id;
}

export type PurchaseSummary = {
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

export function getPurchase(db: Database.Database, purchaseId: string): PurchaseSummary | null {
  const p = db
    .prepare(
      `SELECT p.purchase_id as purchaseId, p.purchased_at as purchasedAt, p.total_price as totalPrice,
              p.payment_method as paymentMethod, p.buyer_type as buyerType, p.buyer_id as buyerId,
              p.terminal_id as terminalId, p.status as status,
              b.name as buyerName
       FROM purchases p
       LEFT JOIN buyers b ON p.buyer_id = b.buyer_id
       WHERE p.purchase_id = ?`
    )
    .get(purchaseId) as (PurchaseSummary & { buyerName: string | null }) | undefined;
  if (!p) return null;
  const items = db
    .prepare(
      `SELECT pi.item_id as itemId, i.name, pi.quantity, pi.unit_price as unitPrice, pi.subtotal
       FROM purchase_items pi
       JOIN items i ON pi.item_id = i.item_id
       WHERE pi.purchase_id = ?`
    )
    .all(purchaseId) as PurchaseSummary["items"];
  return { ...p, items };
}

export function listPurchasesByDate(db: Database.Database, date: string): PurchaseSummary[] {
  const rows = db
    .prepare(
      `SELECT p.purchase_id as purchaseId, p.purchased_at as purchasedAt, p.total_price as totalPrice,
              p.payment_method as paymentMethod, p.buyer_type as buyerType, p.buyer_id as buyerId,
              p.terminal_id as terminalId, p.status as status,
              b.name as buyerName
       FROM purchases p
       LEFT JOIN buyers b ON p.buyer_id = b.buyer_id
       WHERE p.purchased_at >= ? AND p.purchased_at < ?
       ORDER BY p.purchased_at DESC`
    )
    .all(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`) as (PurchaseSummary & { buyerName: string | null })[];

  const getItems = db.prepare(
    `SELECT pi.item_id as itemId, i.name, pi.quantity, pi.unit_price as unitPrice, pi.subtotal
     FROM purchase_items pi
     JOIN items i ON pi.item_id = i.item_id
     WHERE pi.purchase_id = ?`
  );

  return rows.map((r) => ({
    ...r,
    items: getItems.all(r.purchaseId) as PurchaseSummary["items"],
  }));
}

export type Stats = {
  byPayment: { PAYPAY: number; CASH: number };
  anonymousCount: number;
  namedCount: number;
  byItem: { itemId: string; name: string; quantity: number }[];
};

export function statsForDate(db: Database.Database, date: string): Stats {
  const purchases = db
    .prepare(
      `SELECT purchase_id, payment_method, buyer_type FROM purchases
       WHERE purchased_at >= ? AND purchased_at < ? AND status = 'COMPLETED'`
    )
    .all(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`) as {
    purchase_id: string;
    payment_method: string;
    buyer_type: string;
  }[];

  const byPayment = { PAYPAY: 0, CASH: 0 };
  let anonymousCount = 0;
  let namedCount = 0;
  for (const p of purchases) {
    if (p.payment_method === "PAYPAY") byPayment.PAYPAY++;
    else if (p.payment_method === "CASH") byPayment.CASH++;
    if (p.buyer_type === "ANONYMOUS") anonymousCount++;
    else namedCount++;
  }

  const itemRows = db
    .prepare(
      `SELECT pi.item_id as itemId, i.name as name, SUM(pi.quantity) as quantity
       FROM purchase_items pi
       JOIN purchases p ON pi.purchase_id = p.purchase_id
       JOIN items i ON pi.item_id = i.item_id
       WHERE p.purchased_at >= ? AND p.purchased_at < ? AND p.status = 'COMPLETED'
       GROUP BY pi.item_id, i.name
       ORDER BY quantity DESC`
    )
    .all(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`) as { itemId: string; name: string; quantity: number }[];

  return { byPayment, anonymousCount, namedCount, byItem: itemRows };
}

export type SupplyRequestRow = {
  requestId: string;
  body: string;
  requesterName: string;
  createdAt: string;
  source: string;
  status: string;
};

export function insertSupplyRequest(
  db: Database.Database,
  data: { body: string; requesterName: string; source: string }
): { requestId: string } {
  const body = data.body.trim();
  const requesterName = data.requesterName.trim();
  if (!body.length || !requesterName.length) throw new Error("INVALID_SUPPLY_REQUEST");
  const src = data.source === "mobile" ? "mobile" : "pos";
  const requestId = nanoid();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO supply_requests (request_id, body, requester_name, created_at, source, status)
     VALUES (?, ?, ?, ?, ?, 'OPEN')`
  ).run(requestId, body, requesterName, createdAt, src);
  return { requestId };
}

export function listSupplyRequests(db: Database.Database): SupplyRequestRow[] {
  const rows = db
    .prepare(
      `SELECT request_id as requestId, body, requester_name as requesterName,
              created_at as createdAt, source, status
       FROM supply_requests
       ORDER BY created_at DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    requestId: String(r.requestId),
    body: String(r.body),
    requesterName: String(r.requesterName),
    createdAt: String(r.createdAt),
    source: String(r.source),
    status: String(r.status),
  }));
}

export function updateSupplyRequestStatus(
  db: Database.Database,
  requestId: string,
  status: "OPEN" | "DONE"
): boolean {
  const r = db.prepare(`UPDATE supply_requests SET status = ? WHERE request_id = ?`).run(status, requestId);
  return r.changes === 1;
}

export type StockEventRow = {
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

export function addStockEvent(
  db: Database.Database,
  data: {
    itemId: string;
    eventType: "REPLENISH" | "ADJUST";
    quantity: number;
    note?: string;
    actor: string;
  }
): { stockEventId: string } {
  const qty = Math.max(0, Math.floor(data.quantity));
  if (qty <= 0) throw new Error("BAD_QUANTITY");
  const row = db
    .prepare(`SELECT stock FROM items WHERE item_id = ?`)
    .get(data.itemId) as { stock: number } | undefined;
  if (!row) throw new Error("ITEM_NOT_FOUND");
  const now = new Date().toISOString();
  const stockEventId = nanoid();
  const before = row.stock;
  const after = data.eventType === "REPLENISH" ? before + qty : qty;
  const delta = after - before;
  const tx = db.transaction(() => {
    db.prepare(`UPDATE items SET stock = ? WHERE item_id = ?`).run(after, data.itemId);
    db.prepare(
      `INSERT INTO stock_events (stock_event_id, item_id, event_type, delta, before_stock, after_stock, note, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      stockEventId,
      data.itemId,
      data.eventType,
      delta,
      before,
      after,
      data.note?.trim() || null,
      data.actor,
      now
    );
  });
  tx();
  return { stockEventId };
}

export function listStockEvents(db: Database.Database, limit: number = 100): StockEventRow[] {
  return db
    .prepare(
      `SELECT se.stock_event_id as stockEventId, se.item_id as itemId, i.name as itemName, se.event_type as eventType,
              se.delta as delta, se.before_stock as beforeStock, se.after_stock as afterStock,
              se.note as note, se.actor as actor, se.created_at as createdAt
       FROM stock_events se
       JOIN items i ON se.item_id = i.item_id
       ORDER BY se.created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(500, Math.floor(limit)))) as StockEventRow[];
}

export function cancelPurchase(
  db: Database.Database,
  purchaseId: string,
  actor: string
): { canceled: boolean } {
  const purchase = db
    .prepare(`SELECT status FROM purchases WHERE purchase_id = ?`)
    .get(purchaseId) as { status: string } | undefined;
  if (!purchase) throw new Error("PURCHASE_NOT_FOUND");
  if (purchase.status === "CANCELED") return { canceled: false };

  const rows = db
    .prepare(`SELECT item_id as itemId, quantity FROM purchase_items WHERE purchase_id = ?`)
    .all(purchaseId) as { itemId: string; quantity: number }[];

  const now = new Date().toISOString();
  const getStock = db.prepare(`SELECT stock FROM items WHERE item_id = ?`);
  const incStock = db.prepare(`UPDATE items SET stock = stock + ? WHERE item_id = ?`);
  const insStockEvent = db.prepare(
    `INSERT INTO stock_events (stock_event_id, item_id, event_type, delta, before_stock, after_stock, note, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    db.prepare(`UPDATE purchases SET status = 'CANCELED' WHERE purchase_id = ?`).run(purchaseId);
    for (const r of rows) {
      const before = (getStock.get(r.itemId) as { stock: number } | undefined)?.stock;
      if (before === undefined) throw new Error("ITEM_NOT_FOUND");
      incStock.run(r.quantity, r.itemId);
      const after = before + r.quantity;
      insStockEvent.run(
        nanoid(),
        r.itemId,
        "CANCEL",
        r.quantity,
        before,
        after,
        `cancel:${purchaseId}`,
        actor,
        now
      );
    }
  });
  tx();
  return { canceled: true };
}

export type OperationLogRow = {
  operationId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: string | null;
  actor: string;
  createdAt: string;
};

export function addAdminOperationLog(
  db: Database.Database,
  log: { action: string; targetType: string; targetId?: string | null; detail?: string | null; actor: string }
) {
  db.prepare(
    `INSERT INTO admin_operation_logs (operation_id, action, target_type, target_id, detail, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(nanoid(), log.action, log.targetType, log.targetId ?? null, log.detail ?? null, log.actor, new Date().toISOString());
}

export function listAdminOperationLogs(db: Database.Database, limit: number = 200): OperationLogRow[] {
  return db
    .prepare(
      `SELECT operation_id as operationId, action, target_type as targetType, target_id as targetId,
              detail, actor, created_at as createdAt
       FROM admin_operation_logs
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(1000, Math.floor(limit)))) as OperationLogRow[];
}

export type StockAlertRow = ItemRow & { isAlerting: boolean };

export function listStockAlerts(db: Database.Database): StockAlertRow[] {
  return listAllItems(db).map((it) => {
    const isAlerting =
      it.alertEnabled &&
      (it.alertCondition === "EQ" ? it.stock === it.alertThreshold : it.stock <= it.alertThreshold);
    return { ...it, isAlerting };
  });
}
