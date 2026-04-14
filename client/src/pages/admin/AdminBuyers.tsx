import { useEffect, useState } from "react";
import { adminBuyers, adminDeleteBuyer, adminSaveBuyer } from "../../api";
import type { Buyer } from "../../types";

const AFFILIATION_OPTIONS = ["", "教員", "秘書", "D", "M2", "M1", "B4", "B3", "その他"] as const;

export function AdminBuyers() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Buyer>>({});
  const [newBuyer, setNewBuyer] = useState<Buyer | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [deletingBuyerId, setDeletingBuyerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    adminBuyers()
      .then((r) => {
        setBuyers(r.buyers);
        setDrafts((prev) => {
          const next: Record<string, Buyer> = {};
          for (const b of r.buyers) next[b.buyerId] = prev[b.buyerId] ?? { ...b };
          return next;
        });
      })
      .catch(() => setError("読み込みに失敗しました"));
  };

  useEffect(() => {
    load();
  }, []);

  const saveAll = async () => {
    setError(null);
    setNotice(null);
    setIsSavingAll(true);
    try {
      const changed = buyers
        .map((b) => ({ current: b, draft: drafts[b.buyerId] ?? b }))
        .filter(({ current, draft }) => {
          return (
            current.name !== draft.name ||
            (current.photoUrl ?? null) !== (draft.photoUrl ?? null) ||
            (current.affiliation ?? null) !== (draft.affiliation ?? null) ||
            current.isActive !== draft.isActive
          );
        });

      for (const row of changed) {
        await adminSaveBuyer({
          buyerId: row.draft.buyerId,
          name: row.draft.name,
          photoUrl: row.draft.photoUrl,
          affiliation: row.draft.affiliation,
          isActive: row.draft.isActive,
        });
      }

      if (newBuyer && newBuyer.name.trim().length > 0) {
        await adminSaveBuyer({
          name: newBuyer.name,
          photoUrl: newBuyer.photoUrl,
          affiliation: newBuyer.affiliation,
          isActive: newBuyer.isActive,
        });
      }

      setNotice(`保存しました（更新 ${changed.length} 件${newBuyer && newBuyer.name.trim().length > 0 ? "・新規 1 件" : ""}）`);
      setNewBuyer(null);
      load();
    } catch (e) {
      const code = e instanceof Error ? e.message : "ERROR";
      if (code === "DUPLICATE_BUYER_NAME") {
        setError("同じ名前の購入者は登録できません");
      } else if (code === "INVALID_BUYER_NAME") {
        setError("名前は必須です");
      } else {
        setError("一括保存に失敗しました");
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  const deleteRow = async (buyerId: string) => {
    setError(null);
    setNotice(null);
    setDeletingBuyerId(buyerId);
    try {
      await adminDeleteBuyer(buyerId);
      setNotice("削除しました");
      load();
    } catch {
      setError("削除に失敗しました");
    } finally {
      setDeletingBuyerId(null);
    }
  };

  return (
    <div className="admin-page">
      <h1>購入者一覧</h1>
      {error && <p className="banner error">{error}</p>}
      {notice && <p className="banner ok">{notice}</p>}

      <div className="row-actions single">
        <button
          type="button"
          className="btn primary"
          onClick={() => setNewBuyer({ buyerId: "", name: "", photoUrl: null, affiliation: null, isActive: true })}
        >
          新規追加
        </button>
        <button type="button" className="btn secondary" disabled={isSavingAll} onClick={() => void saveAll()}>
          すべて保存
        </button>
      </div>

      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-col-name">名前</th>
              <th>所属</th>
              <th>写真URL</th>
              <th>選択可</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {newBuyer && (
              <tr key="new-buyer-row">
                <td className="admin-col-name">
                  <input
                    className="input admin-name-input"
                    value={newBuyer.name}
                    onChange={(e) => setNewBuyer({ ...newBuyer, name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={newBuyer.affiliation ?? ""}
                    onChange={(e) => setNewBuyer({ ...newBuyer, affiliation: e.target.value || null })}
                  >
                    {AFFILIATION_OPTIONS.map((opt) => (
                      <option key={opt || "none"} value={opt}>
                        {opt || "未設定"}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    value={newBuyer.photoUrl ?? ""}
                    onChange={(e) => setNewBuyer({ ...newBuyer, photoUrl: e.target.value || null })}
                  />
                </td>
                <td>
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={newBuyer.isActive}
                      onChange={(e) => setNewBuyer({ ...newBuyer, isActive: e.target.checked })}
                    />
                    <span className="admin-switch-track" aria-hidden="true">
                      <span className="admin-switch-thumb" />
                    </span>
                    <span className="admin-switch-label">{newBuyer.isActive ? "ON" : "OFF"}</span>
                  </label>
                </td>
                <td>
                  <button type="button" className="linkish" onClick={() => setNewBuyer(null)}>
                    取消
                  </button>
                </td>
              </tr>
            )}
            {buyers.map((b) => (
              <tr key={b.buyerId}>
                <td className="admin-col-name">
                  <input
                    className="input admin-name-input"
                    value={drafts[b.buyerId]?.name ?? b.name}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [b.buyerId]: { ...(prev[b.buyerId] ?? b), name: e.target.value },
                      }))
                    }
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={drafts[b.buyerId]?.affiliation ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [b.buyerId]: { ...(prev[b.buyerId] ?? b), affiliation: e.target.value || null },
                      }))
                    }
                  >
                    {AFFILIATION_OPTIONS.map((opt) => (
                      <option key={opt || "none"} value={opt}>
                        {opt || "未設定"}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    value={drafts[b.buyerId]?.photoUrl ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [b.buyerId]: { ...(prev[b.buyerId] ?? b), photoUrl: e.target.value || null },
                      }))
                    }
                  />
                </td>
                <td>
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={drafts[b.buyerId]?.isActive ?? b.isActive}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [b.buyerId]: { ...(prev[b.buyerId] ?? b), isActive: e.target.checked },
                        }))
                      }
                    />
                    <span className="admin-switch-track" aria-hidden="true">
                      <span className="admin-switch-thumb" />
                    </span>
                    <span className="admin-switch-label">{(drafts[b.buyerId]?.isActive ?? b.isActive) ? "ON" : "OFF"}</span>
                  </label>
                </td>
                <td>
                  <button
                    type="button"
                    className="linkish"
                    disabled={deletingBuyerId === b.buyerId}
                    onClick={() => void deleteRow(b.buyerId)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
