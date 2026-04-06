import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CheckoutState = {
  buyerType: "NAMED" | "ANONYMOUS" | null;
  buyerId: string | null;
  paymentMethod: "PAYPAY" | "CASH" | null;
  setBuyer: (type: "NAMED" | "ANONYMOUS", buyerId: string | null) => void;
  setPayment: (m: "PAYPAY" | "CASH" | null) => void;
  reset: () => void;
};

const CheckoutContext = createContext<CheckoutState | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [buyerType, setBuyerType] = useState<"NAMED" | "ANONYMOUS" | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"PAYPAY" | "CASH" | null>(null);

  const setBuyer = useCallback((type: "NAMED" | "ANONYMOUS", id: string | null) => {
    setBuyerType(type);
    setBuyerId(type === "NAMED" ? id : null);
  }, []);

  const reset = useCallback(() => {
    setBuyerType(null);
    setBuyerId(null);
    setPaymentMethod(null);
  }, []);

  const value = useMemo(
    () => ({
      buyerType,
      buyerId,
      paymentMethod,
      setBuyer,
      setPayment: setPaymentMethod,
      reset,
    }),
    [buyerType, buyerId, paymentMethod, setBuyer, reset]
  );

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout() {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error("useCheckout outside provider");
  return ctx;
}
