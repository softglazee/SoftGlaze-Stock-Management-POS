/** API entity shapes (Prisma Decimal → string over JSON) */

export type Unit = {
  id: string;
  name: string;
  shortName: string;
  baseUnitId: string | null;
  baseUnit?: { id: string; name: string; shortName: string } | null;
  factor: string;
  _count?: { products: number };
};

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  image: string | null;
  isActive: boolean;
  _count?: { products: number; children: number };
};

export type ProductImage = {
  id: string;
  productId: string;
  path: string;
  thumbPath: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type ProductType = "STANDARD" | "SERVICE" | "COMBO";

export type Brand = {
  id: string;
  name: string;
  image: string | null;
  isActive: boolean;
  _count?: { products: number };
};

export type ComboItemView = {
  id: string;
  componentProductId: string;
  qty: string;
  componentProduct?: { id: string; name: string; sku: string; unit?: { shortName: string } };
};

export type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  type: ProductType;
  categoryId: string;
  category?: { id: string; name: string };
  unitId: string;
  unit?: { id: string; name: string; shortName: string };
  brandId: string | null;
  brand?: { id: string; name: string } | null;
  costPrice: string;
  salePrice: string;
  wholesalePrice: string | null;
  taxPercent: string;
  stockQty: string;
  minStockLevel: string;
  length: string | null;
  width: string | null;
  height: string | null;
  weight: string | null;
  isActive: boolean;
  images: ProductImage[];
  comboItems?: ComboItemView[];
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  openingBalance: string;
  balance: string;
  creditLimit: string;
  isActive: boolean;
};

export type Vendor = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  bankDetails: string | null;
  openingBalance: string;
  balance: string;
  isActive: boolean;
};

export type PaymentMethod = { id: string; name: string; isCash: boolean; isActive: boolean };

export type PurchaseItem = {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string; unit?: { shortName: string } };
  qty: string;
  unitCost: string;
  discount: string;
  total: string;
};
export type PurchasePayment = { id: string; amount: string; method?: { name: string } };
export type PurchaseStatus = "DRAFT" | "RECEIVED" | "RETURNED" | "CANCELLED";
export type Purchase = {
  id: string;
  invoiceNo: string;
  vendorId: string;
  vendor?: { id: string; code: string; name: string };
  user?: { id: string; name: string };
  refInvoiceNo: string | null;
  date: string;
  status: PurchaseStatus;
  subTotal: string;
  discount: string;
  tax: string;
  otherCharges: string;
  grandTotal: string;
  paidAmount: string;
  dueAmount: string;
  notes: string | null;
  isReturn: boolean;
  returnOfId: string | null;
  items: PurchaseItem[];
  payments?: PurchasePayment[];
};

export type StockMoveType =
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "SALE"
  | "SALE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGE"
  | "OPENING";
export type StockMovement = {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string; unit?: { shortName: string } };
  type: StockMoveType;
  qty: string;
  unitCost: string | null;
  refType: string | null;
  refId: string | null;
  balance: string;
  date: string;
  notes: string | null;
};
export type StockAdjustmentItem = {
  id: string;
  productId: string;
  product?: { name: string; sku: string; unit?: { shortName: string } };
  qtyChange: string;
};
export type StockAdjustment = {
  id: string;
  refNo: string;
  reason: string;
  date: string;
  user?: { name: string };
  items: StockAdjustmentItem[];
};

export type BusinessPresetInfo = {
  key: string;
  label: string;
  description: string;
  categoryNames: string[];
  unitNames: string[];
};

export type Paged<T extends string, V> = { total: number; page: number; pages: number } & Record<T, V[]>;
