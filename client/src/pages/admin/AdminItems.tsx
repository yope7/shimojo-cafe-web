import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { adminBulkUpsertItems, adminDeleteItem, adminItemImages, adminItems, adminSendAllNotification } from "../../api";
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
  category?: "DRINK" | "SNACK" | "OTHER";
  alertEnabled: boolean;
  alertThreshold: number;
  alertCondition: "LTE" | "EQ";
};

const CATEGORY_OPTIONS = [
  { value: "DRINK", label: "ドリンク" },
  { value: "SNACK", label: "お菓子" },
  { value: "OTHER", label: "その他" },
] as const;
type ItemCategory = (typeof CATEGORY_OPTIONS)[number]["value"];

const CATEGORY_ORDER: Record<ItemCategory, number> = {
  DRINK: 0,
  SNACK: 1,
  OTHER: 2,
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
    const categoryRaw = read("category");
    const category: ItemCategory =
      categoryRaw === "DRINK" || categoryRaw === "SNACK" || categoryRaw === "OTHER" ? categoryRaw : "OTHER";
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
      category,
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
  const [itemImages, setItemImages] = useState<string[]>([]);
  const [newItem, setNewItem] = useState<Item | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvPanelOpen, setCsvPanelOpen] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [notifySlackOnSave, setNotifySlackOnSave] = useState(false);
  const calcSellPrice = (costPrice: number) => Math.max(0, Math.round((costPrice * 1.1) / 10) * 10);
  const calcSellSliderMax = (costPrice: number) => Math.max(100, Math.ceil((Math.max(costPrice, 0) * 2) / 10) * 10);
  const imageListId = "admin-item-image-list";

  const csvPrompt = `以下の条件で、UTF-8のCSVを出力してください。
- 1行目はヘッダー
- 必須列: name,price,stock
- 任意列: itemId,isActive,imageUrl,displayOrder,category
- isActive は true または false
- category は DRINK / SNACK / OTHER のいずれか（未指定は OTHER）
- 数値は整数
- アラート設定列は不要（取り込み時にデフォルトでOFF）
- 余計な説明文は付けず、CSV本文のみ出力

例ヘッダー:
itemId,name,price,stock,isActive,imageUrl,displayOrder,category`;

  const load = () => {
    Promise.all([adminItems(), adminItemImages()])
      .then(([itemRes, imageRes]) => {
        const sortedItems = [...itemRes.items].sort((a, b) => {
          const aCategory = a.category ?? "OTHER";
          const bCategory = b.category ?? "OTHER";
          const byCategory = CATEGORY_ORDER[aCategory] - CATEGORY_ORDER[bCategory];
          if (byCategory !== 0) return byCategory;
          if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
          return a.name.localeCompare(b.name, "ja");
        });
        setItems(sortedItems);
        setItemImages(imageRes.images);
        setDrafts((prev) => {
          const next: Record<string, Item> = {};
          for (const item of sortedItems) {
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

  const sortedItemsForView = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDraft = drafts[a.itemId] ?? a;
      const bDraft = drafts[b.itemId] ?? b;
      const aCategory = aDraft.category ?? "OTHER";
      const bCategory = bDraft.category ?? "OTHER";
      const byCategory = CATEGORY_ORDER[aCategory] - CATEGORY_ORDER[bCategory];
      if (byCategory !== 0) return byCategory;
      if (aDraft.displayOrder !== bDraft.displayOrder) return aDraft.displayOrder - bDraft.displayOrder;
      return aDraft.name.localeCompare(bDraft.name, "ja");
    });
  }, [items, drafts]);

  const hasItemChanged = (base: Item, next: Item): boolean => {
    return (
      base.name !== next.name ||
      base.costPrice !== next.costPrice ||
      base.price !== next.price ||
      base.stock !== next.stock ||
      base.isActive !== next.isActive ||
      (base.imageUrl ?? null) !== (next.imageUrl ?? null) ||
      base.displayOrder !== next.displayOrder ||
      base.category !== next.category ||
      base.alertEnabled !== next.alertEnabled ||
      base.alertThreshold !== next.alertThreshold ||
      base.alertCondition !== next.alertCondition
    );
  };

  const saveAllRows = async () => {
    setError(null);
    setNotice(null);
    setSavingAll(true);
    try {
      if (newItem && newItem.name.trim().length === 0) {
        throw new Error("新規商品の名前を入力してください");
      }
      const changedRows = items
        .map((it) => ({ base: it, next: drafts[it.itemId] ?? it }))
        .filter(({ base, next }) => hasItemChanged(base, next))
        .map(({ next }) => next);

      const payload: CsvRow[] = changedRows.map((row) => ({
        itemId: row.itemId,
        name: row.name,
        costPrice: row.costPrice,
        price: row.price,
        stock: row.stock,
        isActive: row.isActive,
        imageUrl: row.imageUrl,
        displayOrder: row.displayOrder,
        category: row.category ?? "OTHER",
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
          category: newItem.category ?? "OTHER",
          alertEnabled: newItem.alertEnabled,
          alertThreshold: newItem.alertThreshold,
          alertCondition: newItem.alertCondition,
        });
      }
      if (payload.length === 0) {
        setNotice("変更はありません");
        return;
      }
      await adminBulkUpsertItems(payload);
      if (notifySlackOnSave) {
        try {
          await adminSendAllNotification(`商品情報を更新しました（更新件数: ${payload.length}）`);
          setNotice(`${payload.length} 件を保存しました（Slack通知送信済み）`);
        } catch {
          setNotice(`${payload.length} 件を保存しました`);
          setError("保存は完了しましたが、Slack通知の送信に失敗しました");
        }
      } else {
        setNotice(`${payload.length} 件を保存しました`);
      }
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

  const deleteItemRow = async (item: Item) => {
    const ok = window.confirm(`「${item.name}」を削除します。よろしいですか？`);
    if (!ok) return;
    setError(null);
    setNotice(null);
    setDeletingItemId(item.itemId);
    try {
      await adminDeleteItem(item.itemId);
      setNotice(`${item.name} を削除しました`);
      load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "削除に失敗しました";
      if (message === "ITEM_IN_USE") {
        setError("この商品は購入履歴などで参照されているため削除できません。必要なら「表示」をOFFにしてください。");
      } else if (message === "NOT_FOUND") {
        setError("対象の商品が見つかりませんでした。画面を再読み込みしてください。");
      } else if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
        setError("管理者セッションが切れています。再ログインしてから削除してください。");
      } else {
        setError(`商品の削除に失敗しました（${message}）`);
      }
    } finally {
      setDeletingItemId(null);
    }
  };

  return (
    <div className="admin-page">
      <h1>商品管理</h1>
      {error && <p className="banner error">{error}</p>}
      {notice && <p className="banner">{notice}</p>}

      <div className="admin-items-actions">
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
              category: "OTHER",
              alertEnabled: false,
              alertThreshold: 3,
              alertCondition: "LTE",
            });
          }}
        >
          新規追加
        </button>
        <button type="button" className="btn primary" disabled={savingAll} onClick={() => void saveAllRows()}>
          変更を一括保存
        </button>
        <button type="button" className="btn secondary" onClick={() => setCsvPanelOpen((prev) => !prev)}>
          {csvPanelOpen ? "CSV追加を閉じる" : "CSVから追加"}
        </button>
        <label className="admin-switch">
          <input
            type="checkbox"
            checked={notifySlackOnSave}
            onChange={(e) => setNotifySlackOnSave(e.target.checked)}
          />
          <span className="admin-switch-track" aria-hidden="true">
            <span className="admin-switch-thumb" />
          </span>
          <span className="admin-switch-label">保存時にSlack通知</span>
        </label>
      </div>

      {csvPanelOpen && (
        <div className="admin-section-card admin-csv-panel">
          <div className="admin-csv-panel-head">
            <h2>CSVテキスト入力（貼り付け可）</h2>
            <div className="admin-csv-panel-head-actions">
              <label className="btn secondary">
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
            </div>
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
      )}

      <div className="admin-table-scroll">
        <table className="admin-table admin-items-table">
          <thead>
            <tr>
              <th className="admin-col-name">名前</th>
              <th>仕入れ値</th>
              <th>販売価格</th>
              <th>在庫</th>
              <th>ラベル</th>
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
                <div className="admin-item-image-row">
                  <input
                    className="input admin-image-url-input"
                    list={imageListId}
                    value={newItem.imageUrl ?? ""}
                    placeholder="/images/items/xxx.png"
                    onChange={(e) => setNewItem({ ...newItem, imageUrl: e.target.value || null })}
                  />
                  {newItem.imageUrl ? (
                    <img className="admin-item-image-preview" src={newItem.imageUrl} alt={`${newItem.name || "新規商品"}画像`} />
                  ) : (
                    <span className="admin-item-image-empty">画像なし</span>
                  )}
                </div>
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
                <select
                  className="input"
                  value={newItem.category ?? "OTHER"}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value as ItemCategory })}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                <span className="muted small">未保存</span>
              </td>
            </tr>
          )}
          {sortedItemsForView.map((it) => (
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
                <div className="admin-item-image-row">
                  <input
                    className="input admin-image-url-input"
                    list={imageListId}
                    value={drafts[it.itemId]?.imageUrl ?? it.imageUrl ?? ""}
                    placeholder="/images/items/xxx.png"
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [it.itemId]: { ...(prev[it.itemId] ?? it), imageUrl: e.target.value || null },
                      }))
                    }
                  />
                  {(drafts[it.itemId]?.imageUrl ?? it.imageUrl) ? (
                    <img
                      className="admin-item-image-preview"
                      src={(drafts[it.itemId]?.imageUrl ?? it.imageUrl) ?? ""}
                      alt={`${drafts[it.itemId]?.name ?? it.name}画像`}
                    />
                  ) : (
                    <span className="admin-item-image-empty">画像なし</span>
                  )}
                </div>
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
                <select
                  className="input"
                  value={drafts[it.itemId]?.category ?? it.category ?? "OTHER"}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [it.itemId]: { ...(prev[it.itemId] ?? it), category: e.target.value as ItemCategory },
                    }))
                  }
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                  className="btn ghost"
                  disabled={deletingItemId === it.itemId}
                  onClick={() => void deleteItemRow(it)}
                >
                  {deletingItemId === it.itemId ? "削除中..." : "削除"}
                </button>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>

      <datalist id={imageListId}>
        {itemImages.map((url) => (
          <option key={url} value={url} />
        ))}
      </datalist>

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
