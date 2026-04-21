import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchBuyers, fetchSettings, postPurchase, type PurchaseDetail } from "../api";
import { groupBuyersByTag } from "../buyerGroups";
import { useCart } from "../cart";
import { useCheckout } from "../checkout";
import { useIdleReset } from "../useIdleReset";
import type { Buyer } from "../types";

export function Payment({ onIdleReset }: { onIdleReset: () => void }) {
  const { lines, totalPrice, clear: clearCart } = useCart();
  const { buyerType, buyerId, paymentMethod, setBuyer, setPayment, reset: resetCheckout } = useCheckout();
  const navigate = useNavigate();
  const [paypayText, setPaypayText] = useState("");
  const [cashText, setCashText] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [paymentWarn, setPaymentWarn] = useState<string | null>(null);
  const [buyers, setBuyers] = useState<Buyer[]>([]);

  useIdleReset(true, onIdleReset);

  useEffect(() => {
    fetchSettings().then((s) => {
      setPaypayText(s.paypayInstruction);
      setCashText(s.cashInstruction);
      setTerminalId(s.terminalId);
    });
  }, []);
  const buyerGroups = groupBuyersByTag(buyers);

  const instruction = paymentMethod === "PAYPAY" ? paypayText : paymentMethod === "CASH" ? cashText : "";

  const complete = async () => {
    if (!paymentMethod) return;
    const bt = buyerType ?? "ANONYMOUS";
    setSubmitting(true);
    setStockError(null);
    setPaymentWarn(null);
    try {
      const { purchase } = await postPurchase({
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        paymentMethod,
        buyerType: bt,
        buyerId: bt === "NAMED" ? buyerId : null,
        terminalId,
      });
      navigate("/done", { replace: true, state: { purchase } satisfies { purchase: PurchaseDetail } });
      queueMicrotask(() => {
        clearCart();
        resetCheckout();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "INSUFFICIENT_STOCK") {
        clearCart();
        resetCheckout();
        navigate("/", { replace: true, state: { stockWarning: true } });
      } else {
        setStockError("登録に失敗しました。もう一度お試しください。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteClick = () => {
    if (submitting) return;
    if (!paymentMethod) {
      setPaymentWarn("支払い方法を選択してください。");
      return;
    }
    void complete();
  };

  useEffect(() => {
    fetchBuyers()
      .then((r) => setBuyers(r.buyers))
      .catch(() => {
        // Ignore buyer list failures: payment can proceed anonymously.
      });
  }, []);

  if (lines.length === 0) {
    return (
      <div className="page">
        <p className="banner">カートが空です。</p>
        <Link className="btn" to="/">
          一覧へ
        </Link>
      </div>
    );
  }

  return (
    <div className="page payment">
      <header className="topbar">
        <h1>お支払い</h1>
      </header>

      <p className="muted">合計 ¥{totalPrice.toLocaleString()}</p>

      {stockError && (
        <div className="banner error">
          {stockError}
          <div>
            <Link className="btn primary" to="/">
              商品一覧へ
            </Link>
          </div>
        </div>
      )}
      {paymentWarn && <p className="banner error">{paymentWarn}</p>}

      <div className="payment-workspace">
        <section className="instruction payment-left-panel">
          <h2>購入者（任意）</h2>
          <p className="muted">選ばない場合は匿名購入になります。</p>
          {buyers.length > 0 && (
            <>
              {buyerGroups.map((group) => (
                <section key={group.tag}>
                  <p className="muted buyer-subhead">{group.tag}</p>
                  <div className="grid buyers payment-buyer-grid">
                    {group.buyers.map((b) => (
                      <button
                        key={b.buyerId}
                        type="button"
                        className={`buyer-card ${buyerType === "NAMED" && buyerId === b.buyerId ? "selected" : ""}`}
                        onClick={() => setBuyer("NAMED", b.buyerId)}
                      >
                        <div className="avatar">
                          {b.photoUrl ? <img src={b.photoUrl} alt="" /> : <span>{b.name.slice(0, 1)}</span>}
                        </div>
                        <div className="name">{b.name}</div>
                        <div className="muted">{b.affiliation ?? "未設定"}</div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </section>

        <section className="payment-right-panel">
          <div className="pay-grid">
            <button
              type="button"
              className={`btn huge ${paymentMethod === "PAYPAY" ? "primary" : "secondary"}`}
              onClick={() => {
                setPayment("PAYPAY");
                setPaymentWarn(null);
              }}
            >
              PayPay
            </button>
            <button
              type="button"
              className={`btn huge ${paymentMethod === "CASH" ? "primary" : "secondary"}`}
              onClick={() => {
                setPayment("CASH");
                setPaymentWarn(null);
              }}
            >
              現金
            </button>
          </div>

          <section className="instruction payment-instruction">
            <h2>案内</h2>
            <p className={`instruction-body ${paymentMethod ? "" : "instruction-placeholder"}`}>
              {paymentMethod ? instruction : "支払い方法を選択すると、ここに案内が表示されます。"}
            </p>
          </section>

          <div className="row-actions payment-actions">
            <Link className="btn secondary large" to="/">
              戻る
            </Link>
            <button
              type="button"
              className={`btn large ${paymentMethod ? "primary" : "payment-disabled"}`}
              disabled={submitting}
              onClick={handleCompleteClick}
            >
              購入を完了する
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
