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

export type BusinessPresetInfo = {
  key: string;
  label: string;
  description: string;
  categoryNames: string[];
  unitNames: string[];
};

export type Paged<T extends string, V> = { total: number; page: number; pages: number } & Record<T, V[]>;
