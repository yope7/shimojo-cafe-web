import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { fetchBuyers, fetchSettings, postPurchase, type PurchaseDetail } from "../api";
import { useCart } from "../cart";
import { useCheckout } from "../checkout";
import { useIdleReset } from "../useIdleReset";
import type { Buyer } from "../types";

export function BuyerSelect({ onIdleReset }: { onIdleReset: () => void }) {
  const { lines, clear: clearCart } = useCart();
  const { buyerType, buyerId, paymentMethod, setBuyer, setPayment, reset: resetCheckout } = useCheckout();
  const navigate = useNavigate();
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paypayText, setPaypayText] = useState("");
  const [cashText, setCashText] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [paymentWarn, setPaymentWarn] = useState<string | null>(null);

  useIdleReset(true, onIdleReset);

  useEffect(() => {
    fetchBuyers()
      .then((r) => setBuyers(r.buyers))
      .catch(() => setError("購入者一覧を読み込めませんでした"));
  }, []);

  useEffect(() => {
    fetchSettings().then((s) => {
      setPaypayText(s.paypayInstruction);
      setCashText(s.cashInstruction);
      setTerminalId(s.terminalId);
    });
  }, []);

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
    <div className="page buyer">
      <header className="topbar">
        <h1>購入者を選択</h1>
      </header>

      {error && <p className="banner error">{error}</p>}
      {stockError && <p className="banner error">{stockError}</p>}
      {paymentWarn && <p className="banner error">{paymentWarn}</p>}

      <div className="buyer-scroll">
        <div className="grid buyers">
          {buyers.map((b) => (
            <button
              key={b.buyerId}
              type="button"
              className={`buyer-card ${buyerType === "NAMED" && buyerId === b.buyerId ? "selected" : ""}`}
              onClick={() => {
                flushSync(() => {
                  setBuyer("NAMED", b.buyerId);
                });
                setPaymentWarn(null);
              }}
            >
              <div className="avatar">
                {b.photoUrl ? <img src={b.photoUrl} alt="" /> : <span>{b.name.slice(0, 1)}</span>}
              </div>
              <div className="name">{b.name}</div>
            </button>
          ))}
        </div>
      </div>

      <section className="instruction buyer-instruction">
        <h2>お支払い方法</h2>
        <div className="pay-grid buyer-pay-grid">
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
        <p className={`instruction-body ${paymentMethod ? "" : "instruction-placeholder"}`}>
          {paymentMethod ? instruction : "支払い方法を選択すると、ここに案内が表示されます。"}
        </p>
      </section>

      <div className="buyer-actions">
        <button
          type="button"
          className={`btn large ${buyerType === "ANONYMOUS" ? "primary" : "secondary"}`}
          onClick={() => {
            flushSync(() => {
              setBuyer("ANONYMOUS", null);
            });
            setPaymentWarn(null);
          }}
        >
          匿名で購入
        </button>
        <button
          type="button"
          className={`btn large ${paymentMethod ? "primary" : "payment-disabled"}`}
          disabled={submitting}
          onClick={handleCompleteClick}
        >
          購入を完了する
        </button>
        <Link className="btn secondary large" to="/">
          戻る
        </Link>
      </div>
    </div>
  );
}
