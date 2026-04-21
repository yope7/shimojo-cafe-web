import type { Buyer } from "./types";

type BuyerGroup = {
  tag: string;
  buyers: Buyer[];
};

const AFFILIATION_ORDER = ["D", "M2", "M1", "B4", "B3", "教員", "秘書", "その他"] as const;
const UNSET_TAG = "未設定";

export function groupBuyersByTag(buyers: Buyer[]): BuyerGroup[] {
  const grouped = new Map<string, Buyer[]>();
  for (const buyer of buyers) {
    const key = buyer.affiliation?.trim() || UNSET_TAG;
    const rows = grouped.get(key) ?? [];
    rows.push(buyer);
    grouped.set(key, rows);
  }

  const orderedTags = [...AFFILIATION_ORDER, UNSET_TAG];
  for (const tag of grouped.keys()) {
    if (!orderedTags.includes(tag)) orderedTags.push(tag);
  }

  return orderedTags
    .filter((tag) => grouped.has(tag))
    .map((tag) => ({ tag, buyers: grouped.get(tag) ?? [] }));
}
