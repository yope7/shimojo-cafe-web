import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isSlotHit } from "../wasm/slotWasm";

const SLOT_SYMBOLS = ["🍒", "⭐", "🔔", "7️⃣", "☕"];

type SlotStage = "idle" | "spinning" | "result";

export function SlotPreview() {
  const [slotStage, setSlotStage] = useState<SlotStage>("idle");
  const [slotReels, setSlotReels] = useState<string[]>(["❔", "❔", "❔"]);
  const [slotResultText, setSlotResultText] = useState("");
  const [slotHit, setSlotHit] = useState(false);
  const spinTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const spinningRef = useRef(false);

  const stopAllTimers = () => {
    if (spinTimerRef.current) {
      window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }
    if (resultTimerRef.current) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
    spinningRef.current = false;
  };

  const playSlot = async () => {
    if (spinningRef.current) return;
    spinningRef.current = true;
    const randomSeed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const hit = await isSlotHit(randomSeed);
    const finalSymbols = hit
      ? Array(3).fill(SLOT_SYMBOLS[randomSeed % SLOT_SYMBOLS.length])
      : [
          SLOT_SYMBOLS[randomSeed % SLOT_SYMBOLS.length],
          SLOT_SYMBOLS[(randomSeed + 1) % SLOT_SYMBOLS.length],
          SLOT_SYMBOLS[(randomSeed + 2) % SLOT_SYMBOLS.length],
        ];

    setSlotStage("spinning");
    setSlotHit(hit);
    setSlotResultText("");
    spinTimerRef.current = window.setInterval(() => {
      setSlotReels([
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
      ]);
    }, 95);

    resultTimerRef.current = window.setTimeout(() => {
      if (spinTimerRef.current) {
        window.clearInterval(spinTimerRef.current);
        spinTimerRef.current = null;
      }
      resultTimerRef.current = null;
      setSlotReels(finalSymbols);
      setSlotStage("result");
      setSlotResultText(hit ? "おめでとう！当たりです！" : "残念、今回はハズレ！");
      spinningRef.current = false;
    }, 2100);
  };

  useEffect(() => {
    void playSlot();
    return () => {
      stopAllTimers();
    };
  }, []);

  return (
    <div className="page slot-preview-page">
      <header className="topbar">
        <h1>スロットプレビュー</h1>
      </header>
      <p className="muted">Wasm判定（当たり 1/3）を自動再生で確認できます。</p>

      <div className="slot-preview-card">
        <p className="slot-preview-kicker">Lucky Time</p>
        <div className={`slot-reels ${slotStage === "spinning" ? "spinning" : ""}`}>
          {slotReels.map((symbol, idx) => (
            <div key={`preview-slot-${idx}`} className="slot-reel">
              <span className="slot-reel-value">{symbol}</span>
            </div>
          ))}
        </div>
        <p className={`slot-result ${slotStage === "result" ? (slotHit ? "hit" : "miss") : ""}`}>
          {slotStage === "idle" ? "準備中..." : slotStage === "spinning" ? "くるくる抽選中..." : slotResultText}
        </p>
        <div className="row-actions">
          <Link className="btn secondary" to="/">
            メインへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
