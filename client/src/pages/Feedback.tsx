import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { postFeedback } from "../api";

export function Feedback() {
  const [bodyText, setBodyText] = useState("");
  const [senderName, setSenderName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const source: "pos" | "mobile" =
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "mobile" : "pos";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bodyText.trim()) {
      setError("内容を入力してください");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await postFeedback({
        body: bodyText,
        senderName: senderName.trim(),
        source,
      });
      setDone(true);
    } catch {
      setError("送信に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="page supply-request-page">
        <div className="supply-request-done">
          <h1>送信しました</h1>
          <p className="muted">フィードバックありがとうございます。</p>
          <Link className="btn primary large" to="/">
            商品一覧へ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page supply-request-page">
      <header className="topbar">
        <h1>フィードバック</h1>
      </header>
      <form className="supply-request-form" onSubmit={(e) => void submit(e)}>
        <p className="muted supply-request-lead">ご意見・改善案・不具合などを自由に入力してください。</p>
        {error && <p className="banner error">{error}</p>}
        <label className="supply-request-label">
          フィードバック内容
          <textarea
            className="input supply-request-textarea"
            rows={8}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder="例：この商品は説明表示を増やしてほしい"
            required
          />
        </label>
        <label className="supply-request-label">
          お名前（任意）
          <input
            className="input"
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            autoComplete="name"
            placeholder="未入力でも送信できます"
          />
        </label>
        <div className="row-actions">
          <Link className="btn secondary large" to="/">
            キャンセル
          </Link>
          <button type="submit" className="btn primary large" disabled={submitting}>
            送信
          </button>
        </div>
      </form>
    </div>
  );
}
