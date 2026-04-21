type SlotExports = {
  is_hit: (seed: number) => number;
};

let wasmPromise: Promise<SlotExports | null> | null = null;

async function loadSlotModule(): Promise<SlotExports | null> {
  if (wasmPromise) return wasmPromise;
  wasmPromise = (async () => {
    try {
      const response = await fetch("/wasm/slot.wasm");
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes);
      return instance.exports as unknown as SlotExports;
    } catch {
      return null;
    }
  })();
  return wasmPromise;
}

export async function isSlotHit(seed: number): Promise<boolean> {
  const normalizedSeed = seed >>> 0;
  const exports = await loadSlotModule();
  if (!exports?.is_hit) {
    return normalizedSeed % 3 === 0;
  }
  return exports.is_hit(normalizedSeed) === 1;
}
