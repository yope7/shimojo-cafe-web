import { useEffect, useState, type FormEvent } from "react";
import { adminItems, adminSaveItem } from "../../api";
import type { Item } from "../../types";

export function AdminItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    adminItems()
      .then((r) => setItems(r.items))
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
      await adminSaveItem({
        itemId: editing.itemId,
        name: editing.name,
        price: editing.price,
        stock: editing.stock,
        isActive: editing.isActive,
        imageUrl: editing.imageUrl,
        displayOrder: editing.displayOrder,
        alertEnabled: editing.alertEnabled,
        alertThreshold: editing.alertThreshold,
        alertCondition: editing.alertCondition,
      });
      setEditing(null);
      load();
    } catch {
      setError("保存に失敗しました");
    }
  };

  return (
    <div className="admin-page">
      <h1>商品管理</h1>
      {error && <p className="banner error">{error}</p>}

      <button
        type="button"
        className="btn primary"
        onClick={() =>
          setEditing({
            itemId: "",
            name: "",
            price: 100,
            stock: 0,
            isActive: true,
            imageUrl: null,
            displayOrder: items.length,
            alertEnabled: true,
            alertThreshold: 3,
            alertCondition: "LTE",
          })
        }
      >
        新規追加
      </button>

      <table className="admin-table">
        <thead>
          <tr>
            <th>名前</th>
            <th>価格</th>
            <th>在庫</th>
            <th>アラート</th>
            <th>表示</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.itemId}>
              <td>{it.name}</td>
              <td>¥{it.price}</td>
              <td>{it.stock}</td>
              <td>
                {it.alertEnabled ? `在庫 ${it.alertCondition === "EQ" ? "=" : "≤"} ${it.alertThreshold}` : "OFF"}
              </td>
              <td>{it.isActive ? "○" : "—"}</td>
              <td>
                <button type="button" className="linkish" onClick={() => setEditing({ ...it })}>
                  編集
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal">
          <form className="admin-form wide" onSubmit={(e) => void save(e)}>
            <h2>{editing.itemId ? "商品を編集" : "商品を追加"}</h2>
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
              価格
              <input
                type="number"
                className="input"
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                min={0}
                required
              />
            </label>
            <label>
              在庫
              <input
                type="number"
                className="input"
                value={editing.stock}
                onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })}
                min={0}
                required
              />
            </label>
            <label>
              画像URL（任意）
              <input
                className="input"
                value={editing.imageUrl ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, imageUrl: e.target.value || null })
                }
              />
            </label>
            <label>
              表示順
              <input
                type="number"
                className="input"
                value={editing.displayOrder}
                onChange={(e) =>
                  setEditing({ ...editing, displayOrder: Number(e.target.value) })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              販売中
            </label>
            <fieldset className="admin-fieldset">
              <legend>在庫アラート</legend>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={editing.alertEnabled}
                  onChange={(e) => setEditing({ ...editing, alertEnabled: e.target.checked })}
                />
                アラートを有効化
              </label>
              <div className="admin-inline">
                <label>
                  条件
                  <select
                    className="input"
                    value={editing.alertCondition}
                    onChange={(e) =>
                      setEditing({ ...editing, alertCondition: e.target.value === "EQ" ? "EQ" : "LTE" })
                    }
                  >
                    <option value="LTE">在庫が以下 (≤)</option>
                    <option value="EQ">在庫が一致 (=)</option>
                  </select>
                </label>
                <label>
                  数値
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={editing.alertThreshold}
                    onChange={(e) =>
                      setEditing({ ...editing, alertThreshold: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </label>
              </div>
            </fieldset>
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
