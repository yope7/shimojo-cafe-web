import { useEffect, useState, type FormEvent } from "react";
import { adminCreateStockEvent, adminItems, adminStockAlerts, adminStockEvents } from "../../api";
import type { StockEvent } from "../../api";
import type { Item } from "../../types";

export function AdminInventoryOps() {
  const [items, setItems] = useState<Item[]>([]);
  const [alerts, setAlerts] = useState<(Item & { isAlerting: boolean })[]>([]);
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [itemId, setItemId] = useState("");
  const [eventType, setEventType] = useState<"REPLENISH" | "ADJUST">("REPLENISH");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const load = () => {
    setError(null);
    Promise.all([adminItems(), adminStockAlerts(), adminStockEvents(200)])
      .then(([i, a, e]) => {
        setItems(i.items);
        setAlerts(a.alerts);
        setEvents(e.events);
        if (!itemId && i.items.length > 0) setItemId(i.items[0].itemId);
      })
      .catch(() => setError("読み込みに失敗しました"));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemId) {
      setError("商品を選択してください");
      return;
    }
    setError(null);
    try {
      await adminCreateStockEvent({
        itemId,
        eventType,
        quantity,
        note: note.trim() || undefined,
      });
      setNote("");
      load();
    } catch {
      setError("登録に失敗しました");
    }
  };

  const alerting = alerts.filter((a) => a.isAlerting);

  return (
    <div className="admin-page">
      <h1>在庫アラート・入庫/棚卸し</h1>
      {error && <p className="banner error">{error}</p>}

      <section className="admin-section-card">
        <h2>アラート対象</h2>
        {alerting.length === 0 ? (
          <p className="muted">現在、アラート対象はありません。</p>
        ) : (
          <ul className="stat-list">
            {alerting.map((a) => (
              <li key={a.itemId}>
                {a.name}: 在庫 {a.stock}（条件: {a.alertCondition === "EQ" ? "=" : "≤"} {a.alertThreshold}）
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section-card">
        <h2>入庫・棚卸し登録</h2>
        <form className="admin-form wide" onSubmit={(e) => void submit(e)}>
          <div className="admin-inline">
            <label>
              商品
              <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((i) => (
                  <option key={i.itemId} value={i.itemId}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              種別
              <select
                className="input"
                value={eventType}
                onChange={(e) => setEventType(e.target.value === "ADJUST" ? "ADJUST" : "REPLENISH")}
              >
                <option value="REPLENISH">入庫（現在在庫に加算）</option>
                <option value="ADJUST">棚卸し（在庫を指定数に合わせる）</option>
              </select>
            </label>
            <label>
              数量
              <input
                type="number"
                min={0}
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
              />
            </label>
          </div>
          <label>
            備考（任意）
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row-actions single">
            <button type="submit" className="btn primary">
              登録
            </button>
          </div>
        </form>
      </section>

      <section className="admin-section-card">
        <h2>在庫履歴</h2>
        <div className="history-list">
          {events.map((ev) => (
            <article key={ev.stockEventId} className="history-card">
              <header>
                <span>{new Date(ev.createdAt).toLocaleString()}</span>
                <span className="tag">{ev.eventType}</span>
              </header>
              <div className="small">
                {ev.itemName}: {ev.beforeStock} → {ev.afterStock} ({ev.delta >= 0 ? "+" : ""}
                {ev.delta})
              </div>
              {ev.note && <div className="small">備考: {ev.note}</div>}
            </article>
          ))}
          {events.length === 0 && <p className="muted">履歴はありません</p>}
        </div>
      </section>
    </div>
  );
}
