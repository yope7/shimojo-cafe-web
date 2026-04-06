import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { PurchaseDetail } from "../api";
import { useIdleReset } from "../useIdleReset";

const AUTO_HOME_MS = 4_000;

type Loc = { purchase?: PurchaseDetail };

export function Done({ onIdleReset }: { onIdleReset: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const purchase = (location.state as Loc | null)?.purchase;

  useIdleReset(true, onIdleReset, 45_000);

  useEffect(() => {
    const t = setTimeout(() => {
      onIdleReset();
      navigate("/", { replace: true });
    }, AUTO_HOME_MS);
    return () => clearTimeout(t);
  }, [navigate, onIdleReset]);

  return (
    <div className="page done">
      <div className="done-icon" aria-hidden>
        ✓
      </div>
      <h1>購入を記録しました</h1>
      <p className="muted">お支払いは案内に従って完了してください。</p>

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
