import { useEffect, useState } from "react";
import { adminOperationLogs } from "../../api";
import type { OperationLog } from "../../api";

export function AdminOperationLogs() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminOperationLogs(300)
      .then((r) => setLogs(r.logs))
      .catch(() => setError("読み込みに失敗しました"));
  }, []);

  return (
    <div className="admin-page">
      <h1>操作ログ</h1>
      {error && <p className="banner error">{error}</p>}

      <div className="history-list">
        {logs.map((log) => (
          <article key={log.operationId} className="history-card">
            <header>
              <span>{new Date(log.createdAt).toLocaleString()}</span>
              <span className="tag">{log.action}</span>
            </header>
            <div className="small">
              対象: {log.targetType}
              {log.targetId ? ` / ${log.targetId}` : ""}
            </div>
            {log.detail && <div className="small">詳細: {log.detail}</div>}
          </article>
        ))}
        {logs.length === 0 && <p className="muted">ログはまだありません</p>}
      </div>
    </div>
  );
}
