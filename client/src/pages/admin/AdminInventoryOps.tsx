import { useEffect, useState, type FormEvent } from "react";
import { adminCreateStockEvent, adminItems, adminSaveItem, adminStockAlerts, adminStockEvents } from "../../api";
import type { StockEvent } from "../../api";
import type { Item } from "../../types";

export function AdminInventoryOps() {
  const [items, setItems] = useState<Item[]>([]);
  const [alerts, setAlerts] = useState<(Item & { isAlerting: boolean })[]>([]);
  const [alertDrafts, setAlertDrafts] = useState<Record<string, Pick<Item, "alertEnabled" | "alertThreshold" | "alertCondition">>>(
    {}
  );
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [itemId, setItemId] = useState("");
  const [eventType, setEventType] = useState<"REPLENISH" | "ADJUST">("REPLENISH");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [savingAlertItemId, setSavingAlertItemId] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([adminItems(), adminStockAlerts(), adminStockEvents(200)])
      .then(([i, a, e]) => {
        setItems(i.items);
        setAlerts(a.alerts);
        setEvents(e.events);
        setAlertDrafts((prev) => {
          const next: Record<string, Pick<Item, "alertEnabled" | "alertThreshold" | "alertCondition">> = {};
          for (const item of i.items) {
            next[item.itemId] = prev[item.itemId] ?? {
              alertEnabled: item.alertEnabled,
              alertThreshold: item.alertThreshold,
              alertCondition: item.alertCondition,
            };
          }
          return next;
        });
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

  const enabledAlerts = alerts.filter((a) => a.alertEnabled);
  const alerting = enabledAlerts.filter((a) => a.isAlerting);
  const itemsWithDraft = items.map((item) => ({
    ...item,
    ...(alertDrafts[item.itemId] ?? {
      alertEnabled: item.alertEnabled,
      alertThreshold: item.alertThreshold,
      alertCondition: item.alertCondition,
    }),
  }));

  const saveAlertRule = async (item: Item) => {
    const draft = alertDrafts[item.itemId] ?? {
      alertEnabled: item.alertEnabled,
      alertThreshold: item.alertThreshold,
      alertCondition: item.alertCondition,
    };
    setError(null);
    setNotice(null);
    setSavingAlertItemId(item.itemId);
    try {
      await adminSaveItem({
        itemId: item.itemId,
        name: item.name,
        costPrice: item.costPrice,
        price: item.price,
        stock: item.stock,
        isActive: item.isActive,
        imageUrl: item.imageUrl,
        displayOrder: item.displayOrder,
        category: item.category,
        alertEnabled: draft.alertEnabled,
        alertThreshold: draft.alertThreshold,
        alertCondition: draft.alertCondition,
      });
      setNotice(`${item.name} のアラート設定を保存しました`);
      load();
    } catch {
      setError("アラート設定の保存に失敗しました");
    } finally {
      setSavingAlertItemId(null);
    }
  };

  return (
    <div className="admin-page">
      <h1>在庫アラート・入庫/棚卸し</h1>
      {error && <p className="banner error">{error}</p>}
      {notice && <p className="banner">{notice}</p>}

      <section className="admin-section-card">
        <h2>アラート設定</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>商品</th>
              <th>有効</th>
              <th>条件</th>
              <th>しきい値</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {itemsWithDraft.map((item) => (
              <tr key={item.itemId}>
                <td>{item.name}</td>
                <td>
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={item.alertEnabled}
                      onChange={(e) =>
                        setAlertDrafts((prev) => ({
                          ...prev,
                          [item.itemId]: {
                            alertEnabled: e.target.checked,
                            alertThreshold: prev[item.itemId]?.alertThreshold ?? item.alertThreshold,
                            alertCondition: prev[item.itemId]?.alertCondition ?? item.alertCondition,
                          },
                        }))
                      }
                    />
                    <span className="admin-switch-track" aria-hidden="true">
                      <span className="admin-switch-thumb" />
                    </span>
                    <span className="admin-switch-label">{item.alertEnabled ? "ON" : "OFF"}</span>
                  </label>
                </td>
                <td>
                  <select
                    className="input"
                    disabled={!item.alertEnabled}
                    value={item.alertCondition}
                    onChange={(e) =>
                      setAlertDrafts((prev) => ({
                        ...prev,
                        [item.itemId]: {
                          alertEnabled: prev[item.itemId]?.alertEnabled ?? item.alertEnabled,
                          alertThreshold: prev[item.itemId]?.alertThreshold ?? item.alertThreshold,
                          alertCondition: e.target.value === "EQ" ? "EQ" : "LTE",
                        },
                      }))
                    }
                  >
                    <option value="LTE">在庫 ≤</option>
                    <option value="EQ">在庫 =</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="input admin-stock-input"
                    disabled={!item.alertEnabled}
                    value={item.alertThreshold}
                    onChange={(e) =>
                      setAlertDrafts((prev) => ({
                        ...prev,
                        [item.itemId]: {
                          alertEnabled: prev[item.itemId]?.alertEnabled ?? item.alertEnabled,
                          alertThreshold: Math.max(0, Number(e.target.value) || 0),
                          alertCondition: prev[item.itemId]?.alertCondition ?? item.alertCondition,
                        },
                      }))
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={savingAlertItemId === item.itemId}
                    onClick={() => void saveAlertRule(item)}
                  >
                    保存
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-section-card">
        <h2>アラート一覧</h2>
        {enabledAlerts.length === 0 ? (
          <p className="muted">現在、アラート設定が有効な商品はありません。</p>
        ) : (
          <ul className="stat-list">
            {enabledAlerts.map((a) => (
              <li key={a.itemId}>
                {a.name}: 在庫 {a.stock}（条件: {a.alertCondition === "EQ" ? "=" : "≤"} {a.alertThreshold}）[
                {a.isAlerting ? "発火中" : "監視中"}]
              </li>
            ))}
          </ul>
        )}
        {alerting.length > 0 && <p className="small">発火中: {alerting.length} 件</p>}
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
