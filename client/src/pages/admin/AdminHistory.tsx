import { useEffect, useState } from "react";
import { adminCancelPurchase, adminPurchases, adminStats } from "../../api";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function AdminHistory() {
  const [date, setDate] = useState(todayStr);
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Awaited<ReturnType<typeof adminPurchases>>["purchases"]>(
    []
  );
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>>["stats"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workingPurchaseId, setWorkingPurchaseId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([adminPurchases(date), adminStats(date)])
      .then(([p, s]) => {
        setPurchases(p.purchases);
        setStats(s.stats);
      })
      .catch(() => setError("読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [date]);

  const cancelPurchase = async (purchaseId: string) => {
    setError(null);
    setWorkingPurchaseId(purchaseId);
    try {
      await adminCancelPurchase(purchaseId);
      const [p, s] = await Promise.all([adminPurchases(date), adminStats(date)]);
      setPurchases(p.purchases);
      setStats(s.stats);
    } catch {
      setError("キャンセルに失敗しました");
    } finally {
      setWorkingPurchaseId(null);
    }
  };

  return (
    <div className="admin-page">
      <h1>履歴・集計</h1>
      <label className="inline">
        日付{" "}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
      </label>

      {error && <p className="banner error">{error}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      {stats && !loading && (
        <section className="stats">
          <h2>集計</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">PayPay 件数</div>
              <div className="num">{stats.byPayment.PAYPAY}</div>
            </div>
            <div className="stat-card">
              <div className="label">現金 件数</div>
              <div className="num">{stats.byPayment.CASH}</div>
            </div>
            <div className="stat-card">
              <div className="label">記名</div>
              <div className="num">{stats.namedCount}</div>
            </div>
            <div className="stat-card">
              <div className="label">匿名</div>
              <div className="num">{stats.anonymousCount}</div>
            </div>
          </div>
          <h3>商品別販売数</h3>
          <ul className="stat-list">
            {stats.byItem.map((r) => (
              <li key={r.itemId}>
                {r.name} … {r.quantity}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>購入履歴</h2>
        <div className="history-list">
          {purchases.map((p) => (
            <article key={p.purchaseId} className="history-card">
              <header>
                <span>{new Date(p.purchasedAt).toLocaleString()}</span>
                <span className="tag">{p.paymentMethod}</span>
              </header>
              <div className="small">
                購入者:{" "}
                {p.buyerType === "ANONYMOUS" ? "匿名" : p.buyerName ?? p.buyerId ?? "—"} / ¥
                {p.totalPrice.toLocaleString()} / 状態: {p.status === "CANCELED" ? "キャンセル済み" : "完了"}
              </div>
              <ul>
                {p.items.map((i) => (
                  <li key={i.itemId + i.quantity}>
                    {i.name} × {i.quantity}
                  </li>
                ))}
              </ul>
              {p.status !== "CANCELED" && (
                <div className="history-actions">
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={workingPurchaseId === p.purchaseId}
                    onClick={() => void cancelPurchase(p.purchaseId)}
                  >
                    購入をキャンセル（在庫戻し）
                  </button>
                </div>
              )}
            </article>
          ))}
          {purchases.length === 0 && !loading && <p className="muted">この日の履歴はありません</p>}
        </div>
      </section>
    </div>
  );
}
