import { useEffect, useState } from "react";
import { adminCancelPurchase, adminDeletePurchase, adminPurchases, adminStats } from "../../api";

const PAGE_SIZE = 20;

export function AdminHistory() {
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Awaited<ReturnType<typeof adminPurchases>>["purchases"]>(
    []
  );
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>>["stats"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workingPurchaseId, setWorkingPurchaseId] = useState<string | null>(null);

  const reload = async () => {
    const [p, s] = await Promise.all([adminPurchases(PAGE_SIZE, page * PAGE_SIZE), adminStats(new Date().toISOString().slice(0, 10))]);
    if (p.purchases.length === 0 && p.total > 0 && page > 0) {
      setPage((prev) => Math.max(0, prev - 1));
      return;
    }
    setPurchases(p.purchases);
    setTotal(p.total);
    setStats(s.stats);
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([adminPurchases(PAGE_SIZE, page * PAGE_SIZE), adminStats(new Date().toISOString().slice(0, 10))])
      .then(([p, s]) => {
        setPurchases(p.purchases);
        setTotal(p.total);
        setStats(s.stats);
      })
      .catch(() => setError("読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [page]);

  const cancelPurchase = async (purchaseId: string) => {
    setError(null);
    setWorkingPurchaseId(purchaseId);
    try {
      await adminCancelPurchase(purchaseId);
      await reload();
      window.dispatchEvent(new Event("analytics:refresh"));
    } catch {
      setError("キャンセルに失敗しました");
    } finally {
      setWorkingPurchaseId(null);
    }
  };

  const removePurchase = async (purchaseId: string) => {
    if (!window.confirm("この購入履歴を削除します。取り消せません。よろしいですか？")) return;
    setError(null);
    setWorkingPurchaseId(purchaseId);
    try {
      await adminDeletePurchase(purchaseId);
      await reload();
      window.dispatchEvent(new Event("analytics:refresh"));
    } catch {
      setError("履歴の削除に失敗しました");
    } finally {
      setWorkingPurchaseId(null);
    }
  };

  return (
    <div className="admin-page">
      <h1>履歴・集計</h1>

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
        <div className="row-actions single" style={{ marginTop: 0, marginBottom: 8 }}>
          <button type="button" className="btn secondary small" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            新しい履歴
          </button>
          <button
            type="button"
            className="btn secondary small"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            古い履歴
          </button>
          <span className="muted">
            {total === 0 ? "0件" : `${page * PAGE_SIZE + 1} - ${Math.min((page + 1) * PAGE_SIZE, total)} / ${total}件`}
          </span>
        </div>
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
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={workingPurchaseId === p.purchaseId}
                    onClick={() => void removePurchase(p.purchaseId)}
                    style={{ marginLeft: 8 }}
                  >
                    履歴を削除
                  </button>
                </div>
              )}
              {p.status === "CANCELED" && (
                <div className="history-actions">
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={workingPurchaseId === p.purchaseId}
                    onClick={() => void removePurchase(p.purchaseId)}
                  >
                    履歴を削除
                  </button>
                </div>
              )}
            </article>
          ))}
          {purchases.length === 0 && !loading && <p className="muted">履歴はありません</p>}
        </div>
      </section>
    </div>
  );
}
