import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminLogin } from "../../api";

export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await adminLogin(password);
      navigate("/admin/items", { replace: true });
    } catch {
      setError("パスワードが違います");
    }
  };

  return (
    <div className="page admin-login">
      <header className="topbar">
        <h1>管理ログイン</h1>
      </header>
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          パスワード
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </label>
        {error && <p className="banner error">{error}</p>}
        <button type="submit" className="btn primary large">
          ログイン
        </button>
      </form>
      <Link className="btn secondary" to="/">
        購入画面へ
      </Link>
    </div>
  );
}
