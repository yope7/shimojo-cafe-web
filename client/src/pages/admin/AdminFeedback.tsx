import { useEffect, useMemo, useState } from "react";
import { adminItemFeedbacks } from "../../api";

export function AdminFeedback() {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof adminItemFeedbacks>>["summary"]>([]);
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof adminItemFeedbacks>>["recent"]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminItemFeedbacks(days, 100)
      .then((r) => {
        setSummary(r.summary);
        setRecent(r.recent);
      })
      .catch(() => setError("高評価データの読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [days]);

  const totalLikes = useMemo(() => summary.reduce((sum, row) => sum + row.likeCount, 0), [summary]);

  return (
    <div className="admin-page">
      <h1>高評価フィードバック</h1>
      <div className="inline">
        <label>
          集計期間
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>直近7日</option>
            <option value={14}>直近14日</option>
            <option value={30}>直近30日</option>
          </select>
        </label>
      </div>

      {error && <p className="banner error">{error}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      {!loading && (
        <>
          <section className="stats">
            <h2>サマリー</h2>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="label">高評価合計</div>
                <div className="num">{totalLikes}</div>
              </div>
              <div className="stat-card">
                <div className="label">高評価された商品数</div>
                <div className="num">{summary.length}</div>
              </div>
            </div>
          </section>

          <section>
            <h2>商品別ランキング</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>順位</th>
                  <th>商品名</th>
                  <th style={{ width: 140 }}>高評価数</th>
                  <th style={{ width: 260 }}>最終評価日時</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row, idx) => (
                  <tr key={row.itemId}>
                    <td>{idx + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.likeCount}</td>
                    <td>{row.lastFeedbackAt ? new Date(row.lastFeedbackAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary.length === 0 && <p className="muted">高評価はまだありません</p>}
          </section>

          <section>
            <h2>最新の高評価</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 260 }}>日時</th>
                  <th>商品名</th>
                  <th style={{ width: 140 }}>種別</th>
                  <th style={{ width: 120 }}>経路</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.feedbackId}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.itemName}</td>
                    <td>{row.feedbackType === "LIKE" ? "高評価" : row.feedbackType}</td>
                    <td>{row.source === "mobile" ? "スマホ" : "POS"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recent.length === 0 && <p className="muted">データはまだありません</p>}
          </section>
        </>
      )}
    </div>
  );
}
