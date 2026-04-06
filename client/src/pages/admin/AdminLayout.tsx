import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { adminItems, adminLogout } from "../../api";

export function AdminLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    adminItems()
      .then(() => setReady(true))
      .catch(() => navigate("/admin/login", { replace: true }));
  }, [navigate]);

  const logout = async () => {
    await adminLogout();
    navigate("/admin/login", { replace: true });
  };

  if (!ready) {
    return (
      <div className="page">
        <p className="muted">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="admin-brand">シモジョーカフェ 管理</div>
        <nav>
          <NavLink to="/admin/items" className={({ isActive }) => (isActive ? "active" : "")}>
            商品
          </NavLink>
          <NavLink to="/admin/buyers" className={({ isActive }) => (isActive ? "active" : "")}>
            購入者
          </NavLink>
          <NavLink to="/admin/history" className={({ isActive }) => (isActive ? "active" : "")}>
            履歴・集計
          </NavLink>
          <NavLink to="/admin/inventory-ops" className={({ isActive }) => (isActive ? "active" : "")}>
            在庫アラート/履歴
          </NavLink>
          <NavLink to="/admin/operation-logs" className={({ isActive }) => (isActive ? "active" : "")}>
            操作ログ
          </NavLink>
          <NavLink to="/admin/supply-requests" className={({ isActive }) => (isActive ? "active" : "")}>
            仕入れ依頼
          </NavLink>
          <NavLink to="/admin/settings" className={({ isActive }) => (isActive ? "active" : "")}>
            設定
          </NavLink>
        </nav>
        <button type="button" className="btn secondary small" onClick={() => void logout()}>
          ログアウト
        </button>
        <Link to="/" className="muted small">
          購入画面へ
        </Link>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
