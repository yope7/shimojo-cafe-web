import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const DEFAULT_MS = 90_000;

/**
 * 購入フロー中のみ使用。無操作でホームへ戻しカートは親でクリアする想定。
 */
export function useIdleReset(
  enabled: boolean,
  onReset: () => void,
  ms: number = DEFAULT_MS
) {
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    if (!enabled) return;

    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onResetRef.current();
        navigate("/", { replace: true });
      }, ms);
    };

    bump();
    const ev = ["pointerdown", "keydown", "touchstart"] as const;
    ev.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    return () => {
      ev.forEach((e) => window.removeEventListener(e, bump));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, ms, navigate]);
}
