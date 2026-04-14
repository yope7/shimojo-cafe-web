import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminMonitor, adminMonitorAnalytics } from "../../api";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString()}`;
}

export function AdminMonitor() {
  const [date, setDate] = useState(todayStr);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ purchaseTotal: number; purchaseCount: number; canceledCount: number } | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [weeks, setWeeks] = useState(8);
  const [timeline, setTimeline] = useState<
    Array<{
      date: string;
      purchaseTotal: number;
      purchaseCount: number;
      canceledCount: number;
      paypayCount: number;
      cashCount: number;
    }>
  >([]);
  const [items, setItems] = useState<
    Array<{
      itemId: string;
      name: string;
      quantity: number;
      revenue: number;
      avgUnitPrice: number;
      currentPrice: number;
      stock: number;
    }>
  >([]);

  useEffect(() => {
    const load = () => {
      setLoading(true);
      setError(null);
      Promise.all([adminMonitor(date), adminMonitorAnalytics(weeks * 7)])
        .then(([r, a]) => {
          setMetrics(r.metrics);
          setTotalRevenue(r.totalRevenue);
          setTimeline(a.timeline);
          setItems(a.items);
        })
        .catch(() => setError("監視データの読み込みに失敗しました"))
        .finally(() => setLoading(false));
    };

    load();
    const onRefresh = () => {
      void Promise.resolve().then(() => load());
    };
    window.addEventListener("analytics:refresh", onRefresh);
    return () => {
      window.removeEventListener("analytics:refresh", onRefresh);
    };
  }, [date, weeks]);

  const previous = timeline.length >= 2 ? timeline[timeline.length - 2] : null;
  const latest = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const delta = latest && previous ? latest.purchaseTotal - previous.purchaseTotal : 0;

  const topItems = useMemo(() => items.slice(0, 10), [items]);
  const inventoryPotential = useMemo(
    () => items.reduce((sum, it) => sum + it.stock * it.currentPrice, 0),
    [items]
  );
  const currentHolding = useMemo(() => totalRevenue - inventoryPotential, [totalRevenue, inventoryPotential]);
  const cashflowSeries = useMemo(() => {
    let cumulativeSales = 0;
    const base = -inventoryPotential;
    const points = timeline.map((p) => {
      cumulativeSales += p.purchaseTotal;
      return {
        ...p,
        balance: base + cumulativeSales,
      };
    });
    const latestBalance = points.length > 0 ? points[points.length - 1].balance : base;
    const soldOutTarget = latestBalance + inventoryPotential;
    return points.map((p) => ({ ...p, soldOutTarget, zeroLine: 0 }));
  }, [timeline, inventoryPotential]);

  return (
    <div className="admin-page">
      <h1>収益モニター</h1>
      <div className="inline">
        <label>
          日付
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>
        <label>
          分析期間
          <select className="input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            <option value={4}>直近4週</option>
            <option value={8}>直近8週</option>
            <option value={12}>直近12週</option>
          </select>
        </label>
      </div>
      {error && <p className="banner error">{error}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      {!loading && metrics && (
        <>
          <section className="stats">
            <h2>当日サマリー</h2>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="label">購入総額</div>
                <div className="num">¥{metrics.purchaseTotal.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="label">所持金総額（入荷考慮）</div>
                <div className="num" style={{ color: currentHolding >= 0 ? "#0f6b3d" : "#b42318" }}>
                  {formatYen(currentHolding)}
                </div>
              </div>
              <div className="stat-card">
                <div className="label">前週比</div>
                <div className="num" style={{ color: delta >= 0 ? "#0f6b3d" : "#b42318", fontSize: "1.2rem" }}>
                  {delta >= 0 ? "+" : ""}¥{delta.toLocaleString()}
                </div>
              </div>
              <div className="stat-card">
                <div className="label">完了件数</div>
                <div className="num">{metrics.purchaseCount}</div>
              </div>
              <div className="stat-card">
                <div className="label">キャンセル件数</div>
                <div className="num">{metrics.canceledCount}</div>
              </div>
              <div className="stat-card">
                <div className="label">在庫評価額（残数×売値）</div>
                <div className="num">{formatYen(inventoryPotential)}</div>
              </div>
              <div className="stat-card">
                <div className="label">売上累計（参考）</div>
                <div className="num">{formatYen(totalRevenue)}</div>
              </div>
            </div>
          </section>

          <section className="admin-section-card monitor-chart-card">
            <h2>売上推移（週次 / 直近{weeks}週）</h2>
            <div className="monitor-chart-box">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8dcc8" />
                  <XAxis dataKey="date" tickFormatter={(v) => `${String(v).slice(5)}週`} />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip
                    formatter={(v) => (typeof v === "number" ? formatYen(v) : String(v ?? ""))}
                    labelFormatter={(v) => `週開始日: ${v}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="purchaseTotal" name="購入総額" stroke="#6b4f2a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="admin-section-card monitor-chart-card">
            <h2>在庫回収の進捗（週次）</h2>
            <div className="monitor-chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={cashflowSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8dcc8" />
                  <XAxis dataKey="date" tickFormatter={(v) => `${String(v).slice(5)}週`} />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip
                    formatter={(v, name) =>
                      `${name === "soldOutTarget" ? "全量売却到達" : "回収バランス"}: ${
                        typeof v === "number" ? formatYen(v) : String(v ?? "")
                      }`
                    }
                    labelFormatter={(v) => `週開始日: ${v}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="balance" name="回収バランス" stroke="#0f6b3d" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="soldOutTarget"
                    name="全量売却到達ライン"
                    stroke="#b45309"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line type="monotone" dataKey="zeroLine" name="損益ゼロライン" stroke="#6b7280" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="muted">
              回収バランス = -在庫評価額 + 累計販売額。全量売却到達ラインは「現在値 + 残数×売値の合計」で算出。
            </p>
          </section>

          <section className="admin-section-card monitor-chart-card">
            <h2>売れ筋商品（販売数 TOP10）</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>順位</th>
                    <th>商品名</th>
                    <th style={{ width: 120 }}>販売数</th>
                    <th style={{ width: 140 }}>売上</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((it, idx) => (
                    <tr key={it.itemId}>
                      <td>{idx + 1}</td>
                      <td>{it.name}</td>
                      <td>{it.quantity} 個</td>
                      <td>{formatYen(it.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </>
      )}
    </div>
  );
}
