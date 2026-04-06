import { useEffect, useState, type FormEvent } from "react";
import { adminSettings, fetchSettings } from "../../api";

export function AdminSettings() {
  const [paypay, setPaypay] = useState("");
  const [cash, setCash] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings().then((s) => {
      setPaypay(s.paypayInstruction);
      setCash(s.cashInstruction);
    });
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      await adminSettings({
        paypayInstruction: paypay,
        cashInstruction: cash,
        ...(newPw.trim() ? { adminPassword: newPw.trim() } : {}),
      });
      setMsg("保存しました");
      setNewPw("");
    } catch {
      setError("保存に失敗しました（ログインし直してください）");
    }
  };

  return (
    <div className="admin-page">
      <h1>設定</h1>
      {msg && <p className="banner ok">{msg}</p>}
      {error && <p className="banner error">{error}</p>}

      <form className="admin-form wide" onSubmit={(e) => void save(e)}>
        <label>
          PayPay 案内文
          <textarea
            className="input"
            rows={4}
            value={paypay}
            onChange={(e) => setPaypay(e.target.value)}
          />
        </label>
        <label>
          現金 案内文
          <textarea
            className="input"
            rows={4}
            value={cash}
            onChange={(e) => setCash(e.target.value)}
          />
        </label>
        <label>
          新しい管理パスワード（空欄なら変更しない）
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
        </label>
        <button type="submit" className="btn primary">
          保存
        </button>
      </form>
    </div>
  );
}
