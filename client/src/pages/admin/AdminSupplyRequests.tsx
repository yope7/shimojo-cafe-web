import { useEffect, useState } from "react";
import { adminSupplyRequests, adminUpdateSupplyRequest, type SupplyRequest } from "../../api";

export function AdminSupplyRequests() {
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    adminSupplyRequests()
      .then((r) => setRequests(r.requests))
      .catch(() => setError("読み込みに失敗しました"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: "OPEN" | "DONE") => {
    setError(null);
    try {
      await adminUpdateSupplyRequest(id, status);
      load();
    } catch {
      setError("更新に失敗しました");
    }
  };

  return (
    <div className="admin-page">
      <h1>仕入れリクエスト</h1>
      {error && <p className="banner error">{error}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      <div className="supply-request-admin-list">
        {requests.map((r) => (
          <article key={r.requestId} className="supply-request-card">
            <header>
              <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time>
              <span className={`tag status-${r.status}`}>{r.status === "DONE" ? "完了" : "未対応"}</span>
              <span className="tag source">{r.source === "mobile" ? "スマホ" : "POS"}</span>
            </header>
            <div className="supply-request-name">依頼者: {r.requesterName}</div>
            <pre className="supply-request-body">{r.body}</pre>
            <div className="supply-request-actions">
              {r.status === "OPEN" ? (
                <button type="button" className="btn primary small" onClick={() => void setStatus(r.requestId, "DONE")}>
                  完了にする
                </button>
              ) : (
                <button type="button" className="btn secondary small" onClick={() => void setStatus(r.requestId, "OPEN")}>
                  未対応に戻す
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {!loading && requests.length === 0 && <p className="muted">リクエストはまだありません</p>}
    </div>
  );
}
