import { useEffect, useState } from "react";
import { useLottie } from "lottie-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { PurchaseDetail } from "../api";
import { useIdleReset } from "../useIdleReset";
import successConfetti from "../assets/success confetti.json";

const AUTO_HOME_SEC = 3;

type Loc = { purchase?: PurchaseDetail };

export function Done({ onIdleReset }: { onIdleReset: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const purchase = (location.state as Loc | null)?.purchase;
  const [tick, setTick] = useState(0);
  const { View: doneAnimation } = useLottie({
    animationData: successConfetti,
    autoplay: true,
    loop: false,
  });

  useIdleReset(true, onIdleReset, 45_000);

  useEffect(() => {
    if (tick >= AUTO_HOME_SEC) {
      onIdleReset();
      navigate("/", { replace: true });
      return;
    }
    const t = setTimeout(() => setTick((n) => n + 1), 1000);
    return () => clearTimeout(t);
  }, [tick, navigate, onIdleReset]);

  const secondsLeft = AUTO_HOME_SEC - tick;

  return (
    <div className="page done">
      <div className="done-icon" aria-hidden>
        <div className="done-rive">{doneAnimation}</div>
      </div>
      <h1>購入を記録しました</h1>
      <p className="muted">お支払いは案内に従って完了してください。</p>

      <p className="done-autohome" aria-live="polite">
        <span className="done-autohome-label">自動でメイン画面に戻ります</span>
        {tick < AUTO_HOME_SEC && (
          <span className="done-autohome-count" aria-label={`あと${secondsLeft}秒`}>
            {secondsLeft}
          </span>
        )}
      </p>

      {purchase && (
        <section className="receipt">
          <div className="receipt-row">
            <span>合計</span>
            <span>¥{purchase.totalPrice.toLocaleString()}</span>
          </div>
          <div className="receipt-row small">
            <span>支払い</span>
            <span>{purchase.paymentMethod === "PAYPAY" ? "PayPay" : "現金"}</span>
          </div>
          <div className="receipt-row small">
            <span>購入者</span>
            <span>
              {purchase.buyerType === "ANONYMOUS"
                ? "匿名"
                : purchase.buyerName ?? purchase.buyerId ?? "—"}
            </span>
          </div>
          <ul className="receipt-items">
            {purchase.items.map((i) => (
              <li key={i.itemId + i.quantity}>
                {i.name} × {i.quantity} = ¥{i.subtotal.toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        className="btn primary large"
        to="/"
        replace
        onClick={() => {
          onIdleReset();
        }}
      >
        商品一覧へ
      </Link>
    </div>
  );
}
