export type Item = {
  itemId: string;
  name: string;
  costPrice: number;
  price: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
  displayOrder: number;
  alertEnabled: boolean;
  alertThreshold: number;
  alertCondition: "LTE" | "EQ";
};

export type Buyer = {
  buyerId: string;
  name: string;
  photoUrl: string | null;
  affiliation: string | null;
  isActive: boolean;
};

export type CartLine = {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  /** カートに入れられる上限（API の在庫。追加のたびに更新） */
  stock: number;
};
