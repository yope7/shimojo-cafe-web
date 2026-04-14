import { useEffect, useState, type ChangeEvent } from "react";
import { adminBulkUpsertItems, adminItems } from "../../api";
import type { Item } from "../../types";

type CsvRow = {
  itemId?: string;
  name: string;
  costPrice: number;
  price?: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
  displayOrder: number;
  alertEnabled: boolean;
  alertThreshold: number;
  alertCondition: "LTE" | "EQ";
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === "," && !inQuote) {
      result.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  result.push(cur);
  return result;
}

function parseBool(input: string, fallback: boolean): boolean {
  const v = input.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error("CSVにデータ行がありません");

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const required = ["name", "price", "stock"];
  for (const key of required) {
    if (!headers.includes(key)) throw new Error(`CSVヘッダーに ${key} が必要です`);
  }

  const idx = (name: string) => headers.indexOf(name);
  const rows: CsvRow[] = [];

  for (let rowNo = 1; rowNo < lines.length; rowNo += 1) {
    const cols = parseCsvLine(lines[rowNo]);
    const read = (name: string) => {
      const i = idx(name);
      return i >= 0 ? (cols[i] ?? "").trim() : "";
    };

    const name = read("name");
    const costPrice = Number(read("price"));
    const stock = Number(read("stock"));
    if (!name || !Number.isFinite(costPrice) || !Number.isFinite(stock)) {
      throw new Error(`CSV ${rowNo + 1}行目が不正です`);
    }

    rows.push({
      itemId: read("itemId") || undefined,
      name,
      costPrice: Math.max(0, Math.floor(costPrice)),
      stock: Math.max(0, Math.floor(stock)),
      isActive: parseBool(read("isActive"), true),
      imageUrl: read("imageUrl") || null,
      displayOrder: Math.max(0, Math.floor(Number(read("displayOrder") || "0"))),
      alertEnabled: false,
      alertThreshold: 3,
      alertCondition: "LTE",
    });
  }
  return rows;
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand below.
    }
  }

  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  return ok;
}

export function AdminItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Item>>({});
  const [newItem, setNewItem] = useState<Item | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const calcSellPrice = (costPrice: number) => Math.max(0, Math.round((costPrice * 1.1) / 10) * 10);
  const calcSellSliderMax = (costPrice: number) => Math.max(100, Math.ceil((Math.max(costPrice, 0) * 2) / 10) * 10);

  const csvPrompt = `以下の条件で、UTF-8のCSVを出力してください。
- 1行目はヘッダー
- 必須列: name,price,stock
- 任意列: itemId,isActive,imageUrl,displayOrder
- isActive は true または false
- 数値は整数
- アラート設定列は不要（取り込み時にデフォルトでOFF）
- 余計な説明文は付けず、CSV本文のみ出力

例ヘッダー:
itemId,name,price,stock,isActive,imageUrl,displayOrder`;

  const load = () => {
    adminItems()
      .then((r) => {
        setItems(r.items);
        setDrafts((prev) => {
          const next: Record<string, Item> = {};
          for (const item of r.items) {
            next[item.itemId] = prev[item.itemId] ?? { ...item };
          }
          return next;
        });
      })
      .catch(() => setError("読み込みに失敗しました"));
  };

  useEffect(() => {
    load();
  }, []);

  const saveAllRows = async () => {
    setError(null);
    setNotice(null);
    setSavingAll(true);
    try {
      if (newItem && newItem.name.trim().length === 0) {
        throw new Error("新規商品の名前を入力してください");
      }
      const rows = items.map((it) => drafts[it.itemId] ?? it);
      const payload: CsvRow[] = rows.map((row) => ({
        itemId: row.itemId,
        name: row.name,
        costPrice: row.costPrice,
        price: row.price,
        stock: row.stock,
        isActive: row.isActive,
        imageUrl: row.imageUrl,
        displayOrder: row.displayOrder,
        alertEnabled: row.alertEnabled,
        alertThreshold: row.alertThreshold,
        alertCondition: row.alertCondition,
      }));
      if (newItem) {
        payload.push({
          name: newItem.name,
          costPrice: newItem.costPrice,
          price: newItem.price,
          stock: newItem.stock,
          isActive: newItem.isActive,
          imageUrl: newItem.imageUrl,
          displayOrder: newItem.displayOrder,
          alertEnabled: newItem.alertEnabled,
          alertThreshold: newItem.alertThreshold,
          alertCondition: newItem.alertCondition,
        });
      }
      const result = await adminBulkUpsertItems(payload);
      setNotice(`${result.updated} 件を保存しました`);
      setNewItem(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "一括保存に失敗しました");
    } finally {
      setSavingAll(false);
    }
  };

  const onCsvSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setNotice(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      const result = await adminBulkUpsertItems(parsed);
      setNotice(`${result.updated} 件を一括更新しました`);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "CSV一括更新に失敗しました";
      setError(message);
    }
  };

  const onCsvTextSubmit = async () => {
    setError(null);
    setNotice(null);
    try {
      const parsed = parseCsv(csvText);
      const result = await adminBulkUpsertItems(parsed);
      setNotice(`${result.updated} 件を一括更新しました`);
      setCsvText("");
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "CSV一括更新に失敗しました";
      setError(message);
    }
  };

  return (
    <div className="admin-page">
      <h1>商品管理</h1>
      {error && <p className="banner error">{error}</p>}
      {notice && <p className="banner">{notice}</p>}

      <button
        type="button"
        className="btn primary"
        onClick={() => {
          setNewItem({
            itemId: "",
            name: "",
            costPrice: 100,
            price: calcSellPrice(100),
            stock: 0,
            isActive: true,
            imageUrl: null,
            displayOrder: items.length,
            alertEnabled: false,
            alertThreshold: 3,
            alertCondition: "LTE",
          });
        }}
      >
        新規追加
      </button>
      <button type="button" className="btn primary" style={{ marginLeft: 8 }} disabled={savingAll} onClick={() => void saveAllRows()}>
        変更を一括保存
      </button>
      <label className="btn secondary" style={{ marginLeft: 8 }}>
        CSV一括更新
        <input type="file" accept=".csv,text/csv" onChange={(e) => void onCsvSelected(e)} style={{ display: "none" }} />
      </label>
      <button
        type="button"
        className="admin-help-icon"
        aria-label="CSVヘルプ"
        title="CSV生成プロンプト"
        onClick={() => setHelpOpen(true)}
      >
        ❓
      </button>

      <div className="admin-section-card admin-csv-panel">
        <div className="admin-csv-panel-head">
          <h2>CSVテキスト入力（貼り付け可）</h2>
        </div>
        <label className="admin-csv-label">
          CSV本文
          <textarea
            className="input admin-csv-textarea"
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"name,price,stock\nコーヒー,150,12\n紅茶,140,9"}
          />
        </label>
        <div className="row-actions single admin-csv-actions">
          <button type="button" className="btn secondary" onClick={() => void onCsvTextSubmit()}>
            テキストから一括更新
          </button>
        </div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-col-name">名前</th>
            <th>仕入れ値</th>
            <th>販売価格</th>
            <th>在庫</th>
            <th>アラート</th>
            <th>表示</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {newItem && (
            <tr key="new-item-row">
              <td className="admin-col-name">
                <input
                  className="input admin-name-input"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={newItem.costPrice}
                  onChange={(e) => {
                    const nextCostPrice = Math.max(0, Number(e.target.value));
                    setNewItem({ ...newItem, costPrice: nextCostPrice, price: calcSellPrice(nextCostPrice) });
                  }}
                />
              </td>
              <td>
                <div className="admin-item-sell">
                  <strong>¥{newItem.price}</strong>
                  <input
                    type="range"
                    min={0}
                    max={calcSellSliderMax(newItem.costPrice)}
                    step={10}
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
              </td>
              <td>
                <input
                  className="input admin-stock-input"
                  type="number"
                  min={0}
                  value={newItem.stock}
                  onChange={(e) => setNewItem({ ...newItem, stock: Math.max(0, Number(e.target.value)) })}
                />
              </td>
              <td>
                <label className="admin-switch">
                  <input
                    type="checkbox"
                    checked={newItem.alertEnabled}
                    onChange={(e) => setNewItem({ ...newItem, alertEnabled: e.target.checked })}
                  />
                  <span className="admin-switch-track" aria-hidden="true">
                    <span className="admin-switch-thumb" />
                  </span>
                  <span className="admin-switch-label">{newItem.alertEnabled ? "ON" : "OFF"}</span>
                </label>
              </td>
              <td>
                <label className="admin-switch">
                  <input
                    type="checkbox"
                    checked={newItem.isActive}
                    onChange={(e) => setNewItem({ ...newItem, isActive: e.target.checked })}
                  />
                  <span className="admin-switch-track" aria-hidden="true">
                    <span className="admin-switch-thumb" />
                  </span>
                  <span className="admin-switch-label">{newItem.isActive ? "ON" : "OFF"}</span>
                </label>
              </td>
              <td>
                <button
                  type="button"
                  className="linkish"
                  disabled={savingAll}
                  onClick={() => setNewItem(null)}
                >
                  キャンセル
                </button>
              </td>
            </tr>
          )}
          {items.map((it) => (
            <tr key={it.itemId}>
              <td className="admin-col-name">
                <input
                  className="input admin-name-input"
                  value={drafts[it.itemId]?.name ?? it.name}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [it.itemId]: { ...(prev[it.itemId] ?? it), name: e.target.value },
                    }))
                  }
                />
              </td>
              <td>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={drafts[it.itemId]?.costPrice ?? it.costPrice}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [it.itemId]: {
                        ...(prev[it.itemId] ?? it),
                        costPrice: Math.max(0, Number(e.target.value)),
                        price: calcSellPrice(Math.max(0, Number(e.target.value))),
                      },
                    }))
                  }
                />
              </td>
              <td>
                <div className="admin-item-sell">
                  <strong>¥{drafts[it.itemId]?.price ?? it.price}</strong>
                  <input
                    type="range"
                    min={0}
                    max={calcSellSliderMax(drafts[it.itemId]?.costPrice ?? it.costPrice)}
                    step={10}
                    value={drafts[it.itemId]?.price ?? it.price}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [it.itemId]: { ...(prev[it.itemId] ?? it), price: Math.max(0, Number(e.target.value)) },
                      }))
                    }
                  />
                </div>
              </td>
              <td>
                <input
                  className="input admin-stock-input"
                  type="number"
                  min={0}
                  value={drafts[it.itemId]?.stock ?? it.stock}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [it.itemId]: { ...(prev[it.itemId] ?? it), stock: Math.max(0, Number(e.target.value)) },
                    }))
                  }
                />
              </td>
              <td>
                <label className="admin-switch">
                  <input
                    type="checkbox"
                    checked={drafts[it.itemId]?.alertEnabled ?? it.alertEnabled}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [it.itemId]: { ...(prev[it.itemId] ?? it), alertEnabled: e.target.checked },
                      }))
                    }
                  />
                  <span className="admin-switch-track" aria-hidden="true">
                    <span className="admin-switch-thumb" />
                  </span>
                  <span className="admin-switch-label">
                    {(drafts[it.itemId]?.alertEnabled ?? it.alertEnabled) ? "ON" : "OFF"}
                  </span>
                </label>
              </td>
              <td>
                <label className="admin-switch">
                  <input
                    type="checkbox"
                    checked={drafts[it.itemId]?.isActive ?? it.isActive}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [it.itemId]: { ...(prev[it.itemId] ?? it), isActive: e.target.checked },
                      }))
                    }
                  />
                  <span className="admin-switch-track" aria-hidden="true">
                    <span className="admin-switch-thumb" />
                  </span>
                  <span className="admin-switch-label">
                    {(drafts[it.itemId]?.isActive ?? it.isActive) ? "ON" : "OFF"}
                  </span>
                </label>
              </td>
              <td>
                <button
                  type="button"
                  className="linkish"
                  disabled={savingAll}
                  onClick={() =>
                    setDrafts((prev) => ({
                      ...prev,
                      [it.itemId]: { ...it },
                    }))
                  }
                >
                  取消
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {helpOpen && (
        <div className="modal" onClick={() => setHelpOpen(false)}>
          <div className="admin-form wide" onClick={(e) => e.stopPropagation()}>
            <h2>CSV一括更新ヘルプ</h2>
            <p className="muted">下のプロンプトをAIに渡して、取り込み可能なCSVを生成できます。</p>
            <pre className="admin-help-prompt">{csvPrompt}</pre>
            <div className="row-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  void copyText(csvPrompt).then((ok) => {
                    if (ok) {
                      setNotice("プロンプトをコピーしました");
                      return;
                    }
                    setError("コピーに失敗しました。手動で選択してコピーしてください");
                  });
                }}
              >
                プロンプトをコピー
              </button>
              <button type="button" className="btn primary" onClick={() => setHelpOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
