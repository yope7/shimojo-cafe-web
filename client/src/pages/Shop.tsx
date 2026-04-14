import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  fetchBuyers,
  fetchItems,
  fetchSettings,
  postItemFeedback,
  postPurchase,
  postSupplyRequest,
  type PurchaseDetail,
} from "../api";
import { useCart } from "../cart";
import { useCheckout } from "../checkout";
import { useIdleReset } from "../useIdleReset";
import type { Buyer, Item } from "../types";

const FIXED_PRODUCT_IMAGE_URL = "/images/cupramen-pro.jpg";

export function Shop({
  onIdleReset,
}: {
  onIdleReset: () => void;
}) {
  const navigate = useNavigate();
  const { addItem, totalCount, totalPrice, lines, setQuantity, removeLine, clear: clearCart } = useCart();
  const { buyerType, buyerId, paymentMethod, setBuyer, setPayment, reset: resetCheckout } = useCheckout();
  const location = useLocation();
  const stockWarning = Boolean((location.state as { stockWarning?: boolean } | null)?.stockWarning);
  const [items, setItems] = useState<Item[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [heavyBuyers, setHeavyBuyers] = useState<Buyer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"cart" | "checkout">("cart");
  const [paypayText, setPaypayText] = useState("");
  const [cashText, setCashText] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [paymentWarn, setPaymentWarn] = useState<string | null>(null);
  const [feedbackMessageByItem, setFeedbackMessageByItem] = useState<Record<string, string>>({});

  useIdleReset(true, onIdleReset);

  useEffect(() => {
    fetchItems()
      .then((r) => setItems(r.items))
      .catch(() => setError("商品を読み込めませんでした"));
  }, []);

  useEffect(() => {
    fetchBuyers()
      .then((r) => {
        setBuyers(r.buyers);
        setHeavyBuyers(r.heavyBuyers ?? []);
      })
      .catch(() => {
        // Ignore buyer list failures: payment can proceed anonymously.
      });
    fetchSettings().then((s) => {
      setPaypayText(s.paypayInstruction);
      setCashText(s.cashInstruction);
      setTerminalId(s.terminalId);
    });
  }, []);

  useEffect(() => {
    if (totalCount === 0) {
      setMode("cart");
    }
  }, [totalCount]);

  const instruction = paymentMethod === "PAYPAY" ? paypayText : paymentMethod === "CASH" ? cashText : "";
  const heavyBuyerIds = new Set(heavyBuyers.map((b) => b.buyerId));
  const otherBuyers = buyers.filter((b) => !heavyBuyerIds.has(b.buyerId));
  const compactBuyerName = (name: string) => name.slice(0, 5);

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
        setMode("cart");
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "INSUFFICIENT_STOCK") {
        clearCart();
        resetCheckout();
        setMode("cart");
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

  const showFeedbackMessage = (itemId: string, message: string) => {
    setFeedbackMessageByItem((prev) => ({ ...prev, [itemId]: message }));
    window.setTimeout(() => {
      setFeedbackMessageByItem((prev) => {
        if (prev[itemId] !== message) return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }, 3500);
  };

  const handleLike = async (item: { itemId: string; name: string }) => {
    try {
      await postItemFeedback({ itemId: item.itemId, feedbackType: "LIKE", source: "pos" });
      showFeedbackMessage(item.itemId, `「${item.name}」に高評価しました`);
    } catch {
      showFeedbackMessage(item.itemId, "高評価の送信に失敗しました");
    }
  };

  const handleRestockRequest = async (item: { itemId: string; name: string }) => {
    try {
      await postSupplyRequest({
        body: `${item.name}を再入荷してほしいです`,
        requesterName: "POS端末",
        source: "pos",
      });
      showFeedbackMessage(item.itemId, `「${item.name}」の再入荷をリクエストしました`);
    } catch {
      showFeedbackMessage(item.itemId, "再入荷リクエストの送信に失敗しました");
    }
  };

  return (
    <div className="page shop">
      <header className="topbar shop-topbar">
        <h1>シモジョーカフェ</h1>
        <div className="shop-header-links">
          <Link to="/supply-request" className="shop-header-link">
            仕入依頼
          </Link>
          <button type="button" className="shop-header-link" aria-disabled="true">
            フィードバック
          </button>
          <Link to="/admin/login" className="shop-header-link" aria-label="管理">
            管理
          </Link>
        </div>
      </header>

      {stockWarning && (
        <p className="banner error">在庫が不足していました。内容を確認して再度お試しください。</p>
      )}
      {error && <p className="banner error">{error}</p>}

      <nav className="shop-flow-steps" aria-label="購入の流れ">
        <ol className="shop-flow-steps-list">
          <li
            className="shop-flow-step"
            data-state={mode === "cart" ? "current" : "done"}
            aria-current={mode === "cart" ? "step" : undefined}
          >
            <span className="shop-flow-step-num">1</span>
            <span className="shop-flow-step-label">商品・カート</span>
          </li>
          <li
            className="shop-flow-step"
            data-state={mode === "checkout" ? "current" : "upcoming"}
            aria-current={mode === "checkout" ? "step" : undefined}
          >
            <span className="shop-flow-step-num">2</span>
            <span className="shop-flow-step-label">購入・お支払い</span>
          </li>
        </ol>
      </nav>

      {mode === "cart" ? (
        <div className="shop-workspace">
          <section className="shop-products-panel">
            <h2 className="shop-panel-title shop-products-panel-title">商品</h2>
            <div className="shop-scroll">
              <div className="grid products">
                {items.map((it) => {
                  const soldOut = it.stock <= 0;
                  const inCart = lines.find((l) => l.itemId === it.itemId)?.quantity ?? 0;
                  const atStockLimit = !soldOut && inCart >= it.stock;
                  return (
                    <button
                      key={it.itemId}
                      type="button"
                      className={`product-card ${soldOut ? "soldout" : ""} ${atStockLimit ? "at-cap" : ""}`}
                      disabled={soldOut || atStockLimit}
                      onClick={() => {
                        if (soldOut || atStockLimit) return;
                        addItem({ itemId: it.itemId, name: it.name, price: it.price, stock: it.stock });
                      }}
                    >
                      <div className="product-thumb">
                        <img src={it.imageUrl ?? FIXED_PRODUCT_IMAGE_URL} alt={it.name} />
                      </div>
                      <div className="product-meta">
                        <div className="name">{it.name}</div>
                        <div className="sub">
                          <span>¥{it.price}</span>
                          {soldOut ? (
                            <span className="stock zero">売り切れ</span>
                          ) : atStockLimit ? (
                            <span className="stock at-cap-label">在庫上限</span>
                          ) : (
                            <span className="stock">残 {it.stock}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="shop-cart-panel" aria-live="polite">
            <div className="shop-dock-inner">
              <h2 className="shop-panel-title">カート</h2>
              <div className="shop-dock-body">
                {lines.length === 0 ? (
                  <p className="shop-dock-hint">商品をタップしてカートに追加してください</p>
                ) : (
                  <ul className="shop-dock-lines">
                    {lines.map((l) => (
                      <li key={l.itemId} className="shop-dock-line">
                        <div className="shop-dock-line-info">
                          <span className="shop-dock-name">{l.name}</span>
                          <span className="shop-dock-sub">¥{l.price}</span>
                        </div>
                        <div className="shop-dock-controls">
                          <button
                            type="button"
                            className="dock-step"
                            aria-label="減らす"
                            onClick={() => setQuantity(l.itemId, l.quantity - 1)}
                          >
                            −
                          </button>
                          <span className="dock-qty">{l.quantity}</span>
                          <button
                            type="button"
                            className="dock-step"
                            aria-label="増やす"
                            disabled={l.quantity >= l.stock}
                            onClick={() => setQuantity(l.itemId, l.quantity + 1)}
                          >
                            +
                          </button>
                          <span className="dock-line-total">¥{(l.price * l.quantity).toLocaleString()}</span>
                          <button type="button" className="dock-remove" onClick={() => removeLine(l.itemId)}>
                            削除
                          </button>
                        </div>
                        <div className="shop-feedback-actions">
                          <button type="button" className="shop-feedback-btn" onClick={() => void handleLike(l)}>
                            高評価
                          </button>
                          <button
                            type="button"
                            className="shop-feedback-btn secondary"
                            onClick={() => void handleRestockRequest(l)}
                          >
                            再入荷リクエスト
                          </button>
                        </div>
                        {feedbackMessageByItem[l.itemId] && (
                          <p className="shop-feedback-message">{feedbackMessageByItem[l.itemId]}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="shop-dock-footer">
                <div className="shop-dock-total">
                  <span className="shop-dock-total-label">合計</span>
                  <div className="shop-dock-total-right">
                    {totalCount > 0 && <span className="shop-dock-count">{totalCount} 点</span>}
                    <span className="shop-dock-total-num">¥{totalPrice.toLocaleString()}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn primary large shop-dock-next ${totalCount === 0 ? "disabled" : ""}`}
                  onClick={() => {
                    if (totalCount === 0) return;
                    setStockError(null);
                    setPaymentWarn(null);
                    setMode("checkout");
                  }}
                >
                  決済に進む
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="shop-workspace">
          <section className="shop-products-panel shop-checkout-stage">
            {stockError && <p className="banner error">{stockError}</p>}
            {paymentWarn && <p className="banner error">{paymentWarn}</p>}
            <div className="shop-checkout-body">
              <section className="instruction shop-checkout-buyers">
                <div className="shop-buyer-scroll">
                  {heavyBuyers.length > 0 && (
                    <>
                      <p className="muted buyer-subhead">よく購入する人（過去7日）</p>
                      <div className="grid buyers shop-buyer-grid-inline shop-buyer-heavy-grid">
                        {heavyBuyers.map((b) => (
                          <button
                            key={b.buyerId}
                            type="button"
                            className={`buyer-card ${buyerType === "NAMED" && buyerId === b.buyerId ? "selected" : ""}`}
                            title={b.name}
                            onClick={() => {
                              flushSync(() => {
                                setBuyer("NAMED", b.buyerId);
                              });
                              setPaymentWarn(null);
                            }}
                          >
                            <div className="name">{compactBuyerName(b.name)}</div>
                          </button>
                        ))}
                      </div>
                      <p className="muted buyer-subhead">すべての購入者</p>
                    </>
                  )}
                  <div className="grid buyers shop-buyer-grid-inline">
                    {otherBuyers.map((b) => (
                      <button
                        key={b.buyerId}
                        type="button"
                        className={`buyer-card ${buyerType === "NAMED" && buyerId === b.buyerId ? "selected" : ""}`}
                        title={b.name}
                        onClick={() => {
                          flushSync(() => {
                            setBuyer("NAMED", b.buyerId);
                          });
                          setPaymentWarn(null);
                        }}
                      >
                        <div className="name">{compactBuyerName(b.name)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="instruction shop-checkout-payment">
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
            </div>
          </section>

          <aside className="shop-cart-panel shop-checkout-side" aria-live="polite">
            <div className="shop-dock-inner">
              <h2 className="shop-panel-title">カート</h2>
              <div className="shop-dock-body">
                <ul className="shop-dock-lines">
                  {lines.map((l) => (
                    <li key={l.itemId} className="shop-dock-line">
                      <div className="shop-dock-line-info">
                        <span className="shop-dock-name">{l.name}</span>
                        <span className="shop-dock-sub">¥{l.price}</span>
                      </div>
                      <div className="shop-dock-controls">
                        <button type="button" className="dock-step dock-step-placeholder" aria-hidden="true" tabIndex={-1}>
                          −
                        </button>
                        <span className="dock-qty">{l.quantity}</span>
                        <button type="button" className="dock-step dock-step-placeholder" aria-hidden="true" tabIndex={-1}>
                          +
                        </button>
                        <span className="dock-line-total">¥{(l.price * l.quantity).toLocaleString()}</span>
                        <button
                          type="button"
                          className="dock-remove dock-remove-placeholder"
                          aria-hidden="true"
                          tabIndex={-1}
                        >
                          削除
                        </button>
                      </div>
                      <div className="shop-feedback-actions">
                        <button type="button" className="shop-feedback-btn" onClick={() => void handleLike(l)}>
                          高評価
                        </button>
                        <button
                          type="button"
                          className="shop-feedback-btn secondary"
                          onClick={() => void handleRestockRequest(l)}
                        >
                          再入荷リクエスト
                        </button>
                      </div>
                      {feedbackMessageByItem[l.itemId] && (
                        <p className="shop-feedback-message">{feedbackMessageByItem[l.itemId]}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shop-dock-footer">
                <div className="shop-dock-total">
                  <span className="shop-dock-total-label">合計</span>
                  <div className="shop-dock-total-right">
                    {totalCount > 0 && <span className="shop-dock-count">{totalCount} 点</span>}
                    <span className="shop-dock-total-num">¥{totalPrice.toLocaleString()}</span>
                  </div>
                </div>
                <div className="shop-checkout-actions shop-checkout-actions-side">
                  <button
                    type="button"
                    className="btn secondary large"
                    onClick={() => {
                      setMode("cart");
                    }}
                  >
                    カートへ戻る
                  </button>
                  <button
                    type="button"
                    className={`btn large ${paymentMethod ? "primary" : "payment-disabled"}`}
                    disabled={submitting}
                    onClick={handleCompleteClick}
                  >
                    購入を完了する
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

    </div>
  );
}
