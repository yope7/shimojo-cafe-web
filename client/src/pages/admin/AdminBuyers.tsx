import { useEffect, useState, type FormEvent } from "react";
import { adminBuyers, adminSaveBuyer } from "../../api";
import type { Buyer } from "../../types";

export function AdminBuyers() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [editing, setEditing] = useState<Buyer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    adminBuyers()
      .then((r) => setBuyers(r.buyers))
      .catch(() => setError("読み込みに失敗しました"));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await adminSaveBuyer({
        buyerId: editing.buyerId,
        name: editing.name,
        photoUrl: editing.photoUrl,
        isActive: editing.isActive,
      });
      setEditing(null);
      load();
    } catch {
      setError("保存に失敗しました");
    }
  };

  return (
    <div className="admin-page">
      <h1>購入者一覧</h1>
      {error && <p className="banner error">{error}</p>}

      <button
        type="button"
        className="btn primary"
        onClick={() =>
          setEditing({
            buyerId: "",
            name: "",
            photoUrl: null,
            isActive: true,
          })
        }
      >
        新規追加
      </button>

      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>写真URL</th>
              <th>選択可</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => (
              <tr key={b.buyerId}>
                <td>{b.name}</td>
                <td className="truncate">{b.photoUrl ?? "—"}</td>
                <td>{b.isActive ? "○" : "—"}</td>
                <td>
                  <button type="button" className="linkish" onClick={() => setEditing({ ...b })}>
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal">
          <form className="admin-form" onSubmit={(e) => void save(e)}>
            <h2>{editing.buyerId ? "購入者を編集" : "購入者を追加"}</h2>
            <label>
              名前
              <input
                className="input"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </label>
            <label>
              顔写真URL（任意）
              <input
                className="input"
                value={editing.photoUrl ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, photoUrl: e.target.value || null })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              一覧に表示
            </label>
            <div className="row-actions">
              <button type="button" className="btn secondary" onClick={() => setEditing(null)}>
                キャンセル
              </button>
              <button type="submit" className="btn primary">
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
