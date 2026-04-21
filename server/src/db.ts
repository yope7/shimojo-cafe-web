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
      cost_price INTEGER NOT NULL DEFAULT 0,
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
      affiliation TEXT,
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

    CREATE TABLE IF NOT EXISTS item_feedbacks (
      feedback_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      feedback_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'pos',
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_item_feedbacks_created ON item_feedbacks(created_at);

    CREATE TABLE IF NOT EXISTS feedback_messages (
      feedback_message_id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      sender_name TEXT,
      source TEXT NOT NULL DEFAULT 'pos',
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN'
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_messages_created ON feedback_messages(created_at);

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

    CREATE TABLE IF NOT EXISTS finance_snapshots (
      date TEXT PRIMARY KEY,
      recorded_purchase_total INTEGER NOT NULL DEFAULT 0,
      shipping_fee INTEGER NOT NULL DEFAULT 0,
      pool_fund INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // Existing DB migration for older schema.
  ensureColumn(db, "items", "alert_enabled INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "items", "alert_threshold INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "items", "alert_condition TEXT NOT NULL DEFAULT 'LTE'");
  ensureColumn(db, "items", "cost_price INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "buyers", "affiliation TEXT");
  db.exec(`
    UPDATE items
    SET cost_price = CAST(ROUND((price / 1.1) / 10.0, 0) * 10 AS INTEGER)
    WHERE cost_price IS NULL OR cost_price <= 0
  `);
  db.exec(`UPDATE items SET price = CAST(ROUND((cost_price * 1.1) / 10.0, 0) * 10 AS INTEGER)`);

  // 静的ファイルを public/IMG/items → public/images/items に移した既存 DB のパスを追随
  db.exec(`
    UPDATE items
    SET image_url = REPLACE(image_url, '/IMG/items/', '/images/items/')
    WHERE image_url IS NOT NULL AND image_url LIKE '%/IMG/items/%'
  `);
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
      costPrice: 80 + (i % 8) * 20,
      stock: 8 + (i % 7),
      order: i,
    };
  });
  const insItem = db.prepare(
    `INSERT INTO items (item_id, name, cost_price, price, stock, is_active, image_url, display_order)
     VALUES (?, ?, ?, ?, ?, 1, NULL, ?)`
  );
  for (const it of items) {
    const sellPrice = Math.round((it.costPrice * 1.1) / 10) * 10;
    insItem.run(nanoid(), it.name, it.costPrice, sellPrice, it.stock, it.order);
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
  costPrice: number;
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
  affiliation: string | null;
  isActive: boolean;
};

export type BuyerWeeklyUsageRow = {
  buyerId: string;
  purchaseCount: number;
  rank: number;
};

function normItem(r: Record<string, unknown>): ItemRow {
  return {
    itemId: String(r.itemId),
    name: String(r.name),
    costPrice: Number(r.costPrice ?? 0),
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
      `SELECT item_id as itemId, name, cost_price as costPrice, price, stock,
              is_active as isActive, image_url as imageUrl, display_order as displayOrder,
              alert_enabled as alertEnabled, alert_threshold as alertThreshold, alert_condition as alertCondition
       FROM items WHERE is_active = 1 ORDER BY display_order ASC, name ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(normItem);
}

/** 直近 `days` 日間の販売個数合計が多い販売中商品 Top N（1 位から連番 rank） */
export type Bestseller7dRow = { itemId: string; rank: number; quantitySold: number };

export function listBestsellerItemsRollingDays(
  db: Database.Database,
  days: number,
  limit: number
): Bestseller7dRow[] {
  const d = Math.max(1, Math.min(366, Math.floor(days)));
  const from = new Date(Date.now() - d * 86400000).toISOString();
  const to = new Date().toISOString();
  const lim = Math.max(1, Math.min(10, Math.floor(limit)));
  const rows = db
    .prepare(
      `SELECT pi.item_id as itemId, SUM(pi.quantity) as quantitySold
       FROM purchase_items pi
       INNER JOIN purchases p ON pi.purchase_id = p.purchase_id
       INNER JOIN items i ON i.item_id = pi.item_id
       WHERE p.status = 'COMPLETED'
         AND p.purchased_at >= ? AND p.purchased_at <= ?
         AND i.is_active = 1
       GROUP BY pi.item_id
       ORDER BY quantitySold DESC
       LIMIT ?`
    )
    .all(from, to, lim) as { itemId: string; quantitySold: number }[];

  return rows.map((r, idx) => ({
    itemId: r.itemId,
    rank: idx + 1,
    quantitySold: Number(r.quantitySold),
  }));
}

export function listAllItems(db: Database.Database): ItemRow[] {
  const rows = db
    .prepare(
      `SELECT item_id as itemId, name, cost_price as costPrice, price, stock,
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
    affiliation: r.affiliation == null ? null : String(r.affiliation),
    isActive: Boolean(r.isActive),
  };
}

export function listBuyersForSale(db: Database.Database): BuyerRow[] {
  const rows = db
    .prepare(
      `SELECT buyer_id as buyerId, name, photo_url as photoUrl, is_active as isActive
              ,affiliation as affiliation
       FROM buyers
       WHERE is_active = 1
       ORDER BY
         CASE affiliation
           WHEN 'D' THEN 1
           WHEN 'M2' THEN 2
           WHEN 'M1' THEN 3
           WHEN 'B4' THEN 4
           WHEN 'B3' THEN 5
           WHEN '教員' THEN 6
           WHEN '秘書' THEN 7
           WHEN 'その他' THEN 8
           ELSE 9
         END ASC,
         name ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(normBuyer);
}

export function listHeavyBuyersForSale(db: Database.Database, days: number = 7, limit: number = 5): BuyerRow[] {
  const from = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT b.buyer_id as buyerId, b.name, b.photo_url as photoUrl, b.is_active as isActive
              ,b.affiliation as affiliation
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
       ORDER BY
         CASE b.affiliation
           WHEN 'D' THEN 1
           WHEN 'M2' THEN 2
           WHEN 'M1' THEN 3
           WHEN 'B4' THEN 4
           WHEN 'B3' THEN 5
           WHEN '教員' THEN 6
           WHEN '秘書' THEN 7
           WHEN 'その他' THEN 8
           ELSE 9
         END ASC,
         b.name ASC`
    )
    .all(from, Math.max(1, limit)) as Record<string, unknown>[];
  return rows.map(normBuyer);
}

export function listBuyerUsageRollingDays(
  db: Database.Database,
  days: number = 7,
  limit: number = 10
): BuyerWeeklyUsageRow[] {
  const from = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         p.buyer_id as buyerId,
         COUNT(*) as purchaseCount,
         MAX(p.purchased_at) as lastPurchasedAt
       FROM purchases p
       JOIN buyers b ON b.buyer_id = p.buyer_id
       WHERE p.status = 'COMPLETED'
         AND p.buyer_type = 'NAMED'
         AND p.buyer_id IS NOT NULL
         AND p.purchased_at >= ?
         AND b.is_active = 1
       GROUP BY p.buyer_id
       ORDER BY purchaseCount DESC, lastPurchasedAt DESC
       LIMIT ?`
    )
    .all(from, Math.max(1, limit)) as Array<{ buyerId: string; purchaseCount: number }>;

  return rows.map((row, index) => ({
    buyerId: row.buyerId,
    purchaseCount: Number(row.purchaseCount),
    rank: index + 1,
  }));
}

export function listAllBuyers(db: Database.Database): BuyerRow[] {
  const rows = db
    .prepare(
      `SELECT buyer_id as buyerId, name, photo_url as photoUrl, is_active as isActive
              ,affiliation as affiliation
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
    costPrice: number;
    price?: number;
    stock: number;
    isActive: boolean;
    imageUrl: string | null;
    displayOrder: number;
    alertEnabled?: boolean;
    alertThreshold?: number;
    alertCondition?: "LTE" | "EQ";
  }
): string {
  const normalizePrice = (value: number) => Math.max(0, Math.round(value / 10) * 10);
  const calcSellPrice = (cost: number) => normalizePrice(cost * 1.1);
  const id = data.itemId && data.itemId.length > 0 ? data.itemId : nanoid();
  const alertThreshold = Math.max(0, Math.floor(data.alertThreshold ?? 3));
  const alertCondition = data.alertCondition === "EQ" ? "EQ" : "LTE";
  const normalizedCostPrice = normalizePrice(Number(data.costPrice));
  const normalizedPrice = Number.isFinite(Number(data.price))
    ? normalizePrice(Number(data.price))
    : calcSellPrice(normalizedCostPrice);
  db.prepare(
    `INSERT INTO items (item_id, name, cost_price, price, stock, is_active, image_url, display_order, alert_enabled, alert_threshold, alert_condition)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       name = excluded.name,
       cost_price = excluded.cost_price,
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
    normalizedCostPrice,
    normalizedPrice,
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
  data: { buyerId?: string; name: string; photoUrl: string | null; affiliation?: string | null; isActive: boolean }
): string {
  const id = data.buyerId && data.buyerId.length > 0 ? data.buyerId : nanoid();
  const normalizedName = data.name.trim();
  if (!normalizedName.length) throw new Error("INVALID_BUYER_NAME");
  const dup = db
    .prepare(`SELECT buyer_id as buyerId FROM buyers WHERE name = ? AND buyer_id <> ? LIMIT 1`)
    .get(normalizedName, id) as { buyerId: string } | undefined;
  if (dup) throw new Error("DUPLICATE_BUYER_NAME");
  db.prepare(
    `INSERT INTO buyers (buyer_id, name, photo_url, affiliation, is_active)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(buyer_id) DO UPDATE SET
       name = excluded.name,
       photo_url = excluded.photo_url,
       affiliation = excluded.affiliation,
       is_active = excluded.is_active`
  ).run(id, normalizedName, data.photoUrl, data.affiliation ?? null, data.isActive ? 1 : 0);
  return id;
}

export function deleteBuyer(db: Database.Database, buyerId: string): boolean {
  const tx = db.transaction((id: string) => {
    db.prepare(`UPDATE purchases SET buyer_id = NULL WHERE buyer_id = ?`).run(id);
    return db.prepare(`DELETE FROM buyers WHERE buyer_id = ?`).run(id).changes === 1;
  });
  return tx(buyerId);
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

export function countPurchases(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM purchases`).get() as { c: number };
  return Number(row?.c ?? 0);
}

export function listPurchasesPaged(db: Database.Database, limit: number, offset: number): PurchaseSummary[] {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  const rows = db
    .prepare(
      `SELECT p.purchase_id as purchaseId, p.purchased_at as purchasedAt, p.total_price as totalPrice,
              p.payment_method as paymentMethod, p.buyer_type as buyerType, p.buyer_id as buyerId,
              p.terminal_id as terminalId, p.status as status,
              b.name as buyerName
       FROM purchases p
       LEFT JOIN buyers b ON p.buyer_id = b.buyer_id
       ORDER BY p.purchased_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(safeLimit, safeOffset) as (PurchaseSummary & { buyerName: string | null })[];

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

export type MonitorMetrics = {
  purchaseTotal: number;
  purchaseCount: number;
  canceledCount: number;
};

export type MonitorTimelinePoint = {
  date: string;
  purchaseTotal: number;
  purchaseCount: number;
  canceledCount: number;
  paypayCount: number;
  cashCount: number;
};

export type ItemAnalyticsPoint = {
  itemId: string;
  name: string;
  quantity: number;
  revenue: number;
  avgUnitPrice: number;
  currentPrice: number;
  stock: number;
};

export type FinanceSnapshotRow = {
  date: string;
  recordedPurchaseTotal: number;
  shippingFee: number;
  poolFund: number;
  note: string | null;
  updatedAt: string;
};

export type AdminStatsPreset = "all" | "today" | "7" | "30";

function jstTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 日本時間の暦日 1 日分を UTC の半開区間 [start, endExclusive) に変換 */
function tokyoDayRangeUtc(ymd: string): { start: string; endExclusive: string } {
  const start = new Date(`${ymd}T00:00:00+09:00`).toISOString();
  const endExclusive = new Date(new Date(`${ymd}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return { start, endExclusive };
}

function aggregateStatsFromPurchases(
  purchases: { purchase_id: string; payment_method: string; buyer_type: string }[]
): Pick<Stats, "byPayment" | "anonymousCount" | "namedCount"> {
  const byPayment = { PAYPAY: 0, CASH: 0 };
  let anonymousCount = 0;
  let namedCount = 0;
  for (const p of purchases) {
    if (p.payment_method === "PAYPAY") byPayment.PAYPAY++;
    else if (p.payment_method === "CASH") byPayment.CASH++;
    if (p.buyer_type === "ANONYMOUS") anonymousCount++;
    else namedCount++;
  }
  return { byPayment, anonymousCount, namedCount };
}

/** 管理画面「集計」用。preset は購入日時（purchased_at）で絞り込み、いずれも完了済みのみ。 */
export function statsForAdminPreset(db: Database.Database, preset: AdminStatsPreset): Stats {
  if (preset === "all") {
    const purchases = db
      .prepare(
        `SELECT purchase_id, payment_method, buyer_type FROM purchases
         WHERE status = 'COMPLETED'`
      )
      .all() as {
      purchase_id: string;
      payment_method: string;
      buyer_type: string;
    }[];
    const base = aggregateStatsFromPurchases(purchases);
    const itemRows = db
      .prepare(
        `SELECT pi.item_id as itemId, i.name as name, SUM(pi.quantity) as quantity
         FROM purchase_items pi
         JOIN purchases p ON pi.purchase_id = p.purchase_id
         JOIN items i ON pi.item_id = i.item_id
         WHERE p.status = 'COMPLETED'
         GROUP BY pi.item_id, i.name
         ORDER BY quantity DESC`
      )
      .all() as { itemId: string; name: string; quantity: number }[];
    return { ...base, byItem: itemRows };
  }

  if (preset === "today") {
    const { start, endExclusive } = tokyoDayRangeUtc(jstTodayYmd());
    const purchases = db
      .prepare(
        `SELECT purchase_id, payment_method, buyer_type FROM purchases
         WHERE status = 'COMPLETED' AND purchased_at >= ? AND purchased_at < ?`
      )
      .all(start, endExclusive) as {
      purchase_id: string;
      payment_method: string;
      buyer_type: string;
    }[];
    const base = aggregateStatsFromPurchases(purchases);
    const itemRows = db
      .prepare(
        `SELECT pi.item_id as itemId, i.name as name, SUM(pi.quantity) as quantity
         FROM purchase_items pi
         JOIN purchases p ON pi.purchase_id = p.purchase_id
         JOIN items i ON pi.item_id = i.item_id
         WHERE p.status = 'COMPLETED' AND p.purchased_at >= ? AND p.purchased_at < ?
         GROUP BY pi.item_id, i.name
         ORDER BY quantity DESC`
      )
      .all(start, endExclusive) as { itemId: string; name: string; quantity: number }[];
    return { ...base, byItem: itemRows };
  }

  const days = preset === "7" ? 7 : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();
  const purchases = db
    .prepare(
      `SELECT purchase_id, payment_method, buyer_type FROM purchases
       WHERE status = 'COMPLETED' AND purchased_at >= ? AND purchased_at <= ?`
    )
    .all(from, to) as {
    purchase_id: string;
    payment_method: string;
    buyer_type: string;
  }[];
  const base = aggregateStatsFromPurchases(purchases);
  const itemRows = db
    .prepare(
      `SELECT pi.item_id as itemId, i.name as name, SUM(pi.quantity) as quantity
       FROM purchase_items pi
       JOIN purchases p ON pi.purchase_id = p.purchase_id
       JOIN items i ON pi.item_id = i.item_id
       WHERE p.status = 'COMPLETED' AND p.purchased_at >= ? AND p.purchased_at <= ?
       GROUP BY pi.item_id, i.name
       ORDER BY quantity DESC`
    )
    .all(from, to) as { itemId: string; name: string; quantity: number }[];
  return { ...base, byItem: itemRows };
}

export function monitorMetricsForDate(db: Database.Database, date: string): MonitorMetrics {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'COMPLETED' THEN total_price ELSE 0 END) as purchaseTotal,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as purchaseCount,
         SUM(CASE WHEN status = 'CANCELED' THEN 1 ELSE 0 END) as canceledCount
       FROM purchases
       WHERE purchased_at >= ? AND purchased_at < ?`
    )
    .get(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`) as
    | { purchaseTotal: number | null; purchaseCount: number | null; canceledCount: number | null }
    | undefined;

  return {
    purchaseTotal: Number(row?.purchaseTotal ?? 0),
    purchaseCount: Number(row?.purchaseCount ?? 0),
    canceledCount: Number(row?.canceledCount ?? 0),
  };
}

export function totalRevenueAllTime(db: Database.Database): number {
  const row = db
    .prepare(`SELECT SUM(total_price) as total FROM purchases WHERE status = 'COMPLETED'`)
    .get() as { total: number | null } | undefined;
  return Number(row?.total ?? 0);
}

export function listMonitorTimeline(db: Database.Database, days: number = 14): MonitorTimelinePoint[] {
  const spanDays = Math.max(7, Math.min(365, Math.floor(days)));
  const weekCount = Math.max(2, Math.ceil(spanDays / 7));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayDow = (today.getUTCDay() + 6) % 7; // Monday=0
  const currentWeekStart = new Date(today);
  currentWeekStart.setUTCDate(today.getUTCDate() - todayDow);
  const startWeek = new Date(currentWeekStart);
  startWeek.setUTCDate(currentWeekStart.getUTCDate() - (weekCount - 1) * 7);

  const rows = db
    .prepare(
      `SELECT
         substr(purchased_at, 1, 10) as date,
         SUM(CASE WHEN status = 'COMPLETED' THEN total_price ELSE 0 END) as purchaseTotal,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as purchaseCount,
         SUM(CASE WHEN status = 'CANCELED' THEN 1 ELSE 0 END) as canceledCount,
         SUM(CASE WHEN status = 'COMPLETED' AND payment_method = 'PAYPAY' THEN 1 ELSE 0 END) as paypayCount,
         SUM(CASE WHEN status = 'COMPLETED' AND payment_method = 'CASH' THEN 1 ELSE 0 END) as cashCount
       FROM purchases
       WHERE purchased_at >= ?
       GROUP BY substr(purchased_at, 1, 10)
       ORDER BY date ASC`
    )
    .all(startWeek.toISOString()) as Array<{
    date: string;
    purchaseTotal: number | null;
    purchaseCount: number | null;
    canceledCount: number | null;
    paypayCount: number | null;
    cashCount: number | null;
  }>;

  const byWeek = new Map<string, MonitorTimelinePoint>();
  const toWeekStart = (isoDate: string) => {
    const d = new Date(`${isoDate}T00:00:00.000Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  };

  for (const r of rows) {
    const weekStart = toWeekStart(r.date);
    const prev = byWeek.get(weekStart) ?? {
      date: weekStart,
      purchaseTotal: 0,
      purchaseCount: 0,
      canceledCount: 0,
      paypayCount: 0,
      cashCount: 0,
    };
    prev.purchaseTotal += Number(r.purchaseTotal ?? 0);
    prev.purchaseCount += Number(r.purchaseCount ?? 0);
    prev.canceledCount += Number(r.canceledCount ?? 0);
    prev.paypayCount += Number(r.paypayCount ?? 0);
    prev.cashCount += Number(r.cashCount ?? 0);
    byWeek.set(weekStart, prev);
  }

  const points: MonitorTimelinePoint[] = [];
  for (let i = 0; i < weekCount; i += 1) {
    const d = new Date(startWeek);
    d.setUTCDate(startWeek.getUTCDate() + i * 7);
    const key = d.toISOString().slice(0, 10);
    points.push(
      byWeek.get(key) ?? {
        date: key,
        purchaseTotal: 0,
        purchaseCount: 0,
        canceledCount: 0,
        paypayCount: 0,
        cashCount: 0,
      }
    );
  }
  return points;
}

export function listItemAnalytics(db: Database.Database, days: number = 30): ItemAnalyticsPoint[] {
  const span = Math.max(2, Math.min(365, Math.floor(days)));
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (span - 1));

  return db
    .prepare(
      `SELECT
         i.item_id as itemId,
         i.name as name,
         i.price as currentPrice,
         i.stock as stock,
         COALESCE(SUM(CASE WHEN p.status = 'COMPLETED' THEN pi.quantity ELSE 0 END), 0) as quantity,
         COALESCE(SUM(CASE WHEN p.status = 'COMPLETED' THEN pi.subtotal ELSE 0 END), 0) as revenue,
         COALESCE(AVG(CASE WHEN p.status = 'COMPLETED' THEN pi.unit_price END), i.price) as avgUnitPrice
       FROM items i
       LEFT JOIN purchase_items pi ON pi.item_id = i.item_id
       LEFT JOIN purchases p ON p.purchase_id = pi.purchase_id AND p.purchased_at >= ?
       GROUP BY i.item_id, i.name, i.price, i.stock
       ORDER BY quantity DESC, revenue DESC, i.name ASC`
    )
    .all(start.toISOString()) as ItemAnalyticsPoint[];
}

export function getFinanceSnapshot(db: Database.Database, date: string): FinanceSnapshotRow | null {
  const row = db
    .prepare(
      `SELECT date, recorded_purchase_total as recordedPurchaseTotal, shipping_fee as shippingFee,
              pool_fund as poolFund, note, updated_at as updatedAt
       FROM finance_snapshots
       WHERE date = ?`
    )
    .get(date) as FinanceSnapshotRow | undefined;
  return row ?? null;
}

export function upsertFinanceSnapshot(
  db: Database.Database,
  data: { date: string; recordedPurchaseTotal: number; shippingFee: number; poolFund: number; note?: string | null }
) {
  db.prepare(
    `INSERT INTO finance_snapshots (date, recorded_purchase_total, shipping_fee, pool_fund, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       recorded_purchase_total = excluded.recorded_purchase_total,
       shipping_fee = excluded.shipping_fee,
       pool_fund = excluded.pool_fund,
       note = excluded.note,
       updated_at = excluded.updated_at`
  ).run(
    data.date,
    Math.max(0, Math.floor(data.recordedPurchaseTotal)),
    Math.max(0, Math.floor(data.shippingFee)),
    Math.max(0, Math.floor(data.poolFund)),
    data.note?.trim() || null,
    new Date().toISOString()
  );
}

export function applyTaxToAllItems(db: Database.Database, ratePercent: number): { updated: number } {
  const safeRate = Math.max(0, Math.min(100, ratePercent));
  const factor = 1 + safeRate / 100;
  const result = db
    .prepare(
      `UPDATE items
       SET cost_price = CAST(ROUND((cost_price * ?) / 10.0, 0) * 10 AS INTEGER),
           price = CAST(ROUND(((CAST(ROUND((cost_price * ?) / 10.0, 0) * 10 AS INTEGER)) * 1.1) / 10.0, 0) * 10 AS INTEGER)`
    )
    .run(factor, factor);
  return { updated: result.changes };
}

export type SupplyRequestRow = {
  requestId: string;
  body: string;
  requesterName: string;
  createdAt: string;
  source: string;
  status: string;
};

export type FeedbackMessageRow = {
  feedbackMessageId: string;
  body: string;
  senderName: string | null;
  source: string;
  createdAt: string;
  status: "OPEN" | "DONE";
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

export function insertItemFeedback(
  db: Database.Database,
  data: { itemId: string; feedbackType: "LIKE"; source: "pos" | "mobile" }
): { feedbackId: string } {
  const item = db.prepare(`SELECT item_id as itemId FROM items WHERE item_id = ? AND is_active = 1`).get(data.itemId) as
    | { itemId: string }
    | undefined;
  if (!item) throw new Error("ITEM_NOT_FOUND");
  const feedbackId = nanoid();
  db.prepare(
    `INSERT INTO item_feedbacks (feedback_id, item_id, feedback_type, source, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(feedbackId, data.itemId, data.feedbackType, data.source, new Date().toISOString());
  return { feedbackId };
}

export function insertFeedbackMessage(
  db: Database.Database,
  data: { body: string; senderName?: string; source: string }
): { feedbackMessageId: string } {
  const body = data.body.trim();
  if (!body.length) throw new Error("INVALID_FEEDBACK_MESSAGE");
  const source = data.source === "mobile" ? "mobile" : "pos";
  const senderName = data.senderName?.trim() || null;
  const feedbackMessageId = nanoid();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO feedback_messages (feedback_message_id, body, sender_name, source, created_at, status)
     VALUES (?, ?, ?, ?, ?, 'OPEN')`
  ).run(feedbackMessageId, body, senderName, source, createdAt);
  return { feedbackMessageId };
}

export function listFeedbackMessages(db: Database.Database, limit: number = 200): FeedbackMessageRow[] {
  return db
    .prepare(
      `SELECT
         feedback_message_id as feedbackMessageId,
         body,
         sender_name as senderName,
         source,
         created_at as createdAt,
         status
       FROM feedback_messages
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(1000, Math.floor(limit)))) as FeedbackMessageRow[];
}

export function updateFeedbackMessageStatus(
  db: Database.Database,
  feedbackMessageId: string,
  status: "OPEN" | "DONE"
): boolean {
  const r = db.prepare(`UPDATE feedback_messages SET status = ? WHERE feedback_message_id = ?`).run(status, feedbackMessageId);
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

export function deletePurchase(db: Database.Database, purchaseId: string): { deleted: boolean; restoredStock: boolean } {
  const purchase = db
    .prepare(`SELECT status FROM purchases WHERE purchase_id = ?`)
    .get(purchaseId) as { status: string } | undefined;
  if (!purchase) throw new Error("PURCHASE_NOT_FOUND");

  const rows = db
    .prepare(`SELECT item_id as itemId, quantity FROM purchase_items WHERE purchase_id = ?`)
    .all(purchaseId) as { itemId: string; quantity: number }[];

  const shouldRestore = purchase.status === "COMPLETED";
  const tx = db.transaction(() => {
    if (shouldRestore) {
      const incStock = db.prepare(`UPDATE items SET stock = stock + ? WHERE item_id = ?`);
      for (const r of rows) {
        incStock.run(r.quantity, r.itemId);
      }
    }
    db.prepare(`DELETE FROM purchases WHERE purchase_id = ?`).run(purchaseId);
  });
  tx();
  return { deleted: true, restoredStock: shouldRestore };
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

export type ItemFeedbackSummaryRow = {
  itemId: string;
  name: string;
  likeCount: number;
  lastFeedbackAt: string | null;
};

export type ItemFeedbackRecentRow = {
  feedbackId: string;
  itemId: string;
  itemName: string;
  feedbackType: "LIKE";
  source: string;
  createdAt: string;
};

/** days <= 0 のときは期間を絞らず全件集計 */
export function listItemFeedbackSummary(db: Database.Database, days: number = 30): ItemFeedbackSummaryRow[] {
  if (days <= 0) {
    return db
      .prepare(
        `SELECT
           i.item_id as itemId,
           i.name as name,
           COUNT(f.feedback_id) as likeCount,
           MAX(f.created_at) as lastFeedbackAt
         FROM item_feedbacks f
         JOIN items i ON i.item_id = f.item_id
         WHERE f.feedback_type = 'LIKE'
         GROUP BY i.item_id, i.name
         ORDER BY likeCount DESC, lastFeedbackAt DESC, i.name ASC`
      )
      .all() as ItemFeedbackSummaryRow[];
  }
  const span = Math.max(1, Math.min(365, Math.floor(days)));
  const from = new Date(Date.now() - span * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT
         i.item_id as itemId,
         i.name as name,
         COUNT(f.feedback_id) as likeCount,
         MAX(f.created_at) as lastFeedbackAt
       FROM item_feedbacks f
       JOIN items i ON i.item_id = f.item_id
       WHERE f.feedback_type = 'LIKE' AND f.created_at >= ?
       GROUP BY i.item_id, i.name
       ORDER BY likeCount DESC, lastFeedbackAt DESC, i.name ASC`
    )
    .all(from) as ItemFeedbackSummaryRow[];
}

export function listItemFeedbackRecent(db: Database.Database, limit: number = 100): ItemFeedbackRecentRow[] {
  return db
    .prepare(
      `SELECT
         f.feedback_id as feedbackId,
         f.item_id as itemId,
         i.name as itemName,
         f.feedback_type as feedbackType,
         f.source as source,
         f.created_at as createdAt
       FROM item_feedbacks f
       JOIN items i ON i.item_id = f.item_id
       ORDER BY f.created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(500, Math.floor(limit)))) as ItemFeedbackRecentRow[];
}
