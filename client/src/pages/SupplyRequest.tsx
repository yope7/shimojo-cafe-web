import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { postSupplyRequest } from "../api";

export function SupplyRequest() {
  const [step, setStep] = useState<1 | 2>(1);
  const [bodyText, setBodyText] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const source: "pos" | "mobile" =
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
      ? "mobile"
      : "pos";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await postSupplyRequest({
        body: bodyText,
        requesterName: requesterName.trim(),
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
          <p className="muted">担当者が内容を確認します。</p>
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
        <h1>仕入れリクエスト</h1>
      </header>

      {step === 1 ? (
        <form
          className="supply-request-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!bodyText.trim()) {
              setError("内容を入力してください");
              return;
            }
            setError(null);
            setStep(2);
          }}
        >
          <p className="muted supply-request-lead">
            必要な商品や数量など、自由にご記入ください（個人情報は本文に含めないでください）。
          </p>
          {error && <p className="banner error">{error}</p>}
          <label className="supply-request-label">
            依頼内容
            <textarea
              className="input supply-request-textarea"
              rows={8}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="例：コーヒー豆 2袋、牛乳 1L×3本"
              required
            />
          </label>
          <div className="row-actions">
            <Link className="btn secondary large" to="/">
              キャンセル
            </Link>
            <button type="submit" className="btn primary large">
              次へ
            </button>
          </div>
        </form>
      ) : (
        <form className="supply-request-form" onSubmit={(e) => void submit(e)}>
          <p className="muted">依頼者のお名前を入力してください。</p>
          {error && <p className="banner error">{error}</p>}
          <label className="supply-request-label">
            お名前
            <input
              className="input"
              type="text"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <div className="row-actions">
            <button
              type="button"
              className="btn secondary large"
              onClick={() => {
                setStep(1);
                setError(null);
              }}
            >
              戻る
            </button>
            <button type="submit" className="btn primary large" disabled={submitting}>
              送信
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
