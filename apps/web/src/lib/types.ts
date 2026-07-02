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

export type SaleStatus = "DRAFT" | "COMPLETED" | "RETURNED" | "CANCELLED" | "QUOTATION";
export type SaleItem = {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string; type: ProductType; unit?: { shortName: string } };
  qty: string;
  unitPrice: string;
  unitCost?: string;
  discount: string;
  taxAmount: string;
  total: string;
};
export type SalePayment = { id: string; amount: string; method?: { name: string } };
export type Sale = {
  id: string;
  invoiceNo: string;
  customerId: string | null;
  customer?: { id: string; code: string; name: string; phone: string | null } | null;
  user?: { id: string; name: string };
  date: string;
  status: SaleStatus;
  subTotal: string;
  discount: string;
  tax: string;
  otherCharges: string;
  grandTotal: string;
  paidAmount: string;
  dueAmount: string;
  totalCost?: string;
  profit?: string;
  notes: string | null;
  isReturn: boolean;
  returnOfId: string | null;
  items: SaleItem[];
  payments?: SalePayment[];
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

// ── Money accounts (G1) ──
export type Account = {
  id: string;
  name: string;
  isCash: boolean;
  isActive: boolean;
  accountNo: string | null;
  bankName: string | null;
  openingBalance: string;
  currentBalance: string;
  sortOrder: number;
};

export type AccountEntryType = "PAYMENT" | "TRANSFER_IN" | "TRANSFER_OUT" | "CAPITAL_IN" | "DRAWING" | "OPENING";
export type AccountEntry = {
  id: string;
  accountId: string;
  type: AccountEntryType;
  amount: string;
  balance: string;
  running?: string;
  refType: string | null;
  refId: string | null;
  date: string;
  notes: string | null;
};

export type FundTransfer = {
  id: string;
  refNo: string;
  fromAccountId: string;
  toAccountId: string;
  fromAccount?: { name: string };
  toAccount?: { name: string };
  amount: string;
  date: string;
  notes: string | null;
  user?: { name: string };
};

export type CapitalDirection = "CAPITAL_IN" | "DRAWING";
export type CapitalEntry = {
  id: string;
  refNo: string;
  direction: CapitalDirection;
  accountId: string;
  account?: { name: string };
  amount: string;
  date: string;
  notes: string | null;
  user?: { name: string };
};

export type PaymentType =
  | "SALE_RECEIPT" | "CUSTOMER_RECEIPT" | "PURCHASE_PAYMENT" | "VENDOR_PAYMENT" | "EXPENSE" | "REFUND_OUT" | "REFUND_IN";
export type Payment = {
  id: string;
  refNo: string;
  type: PaymentType;
  amount: string;
  date: string;
  notes: string | null;
  method?: { name: string };
  customer?: { id: string; code: string; name: string } | null;
  vendor?: { id: string; code: string; name: string } | null;
};

// ── Ledgers / statements ──
export type LedgerEntry = { date: string; refNo: string; type: string; description: string; debit: number; credit: number; balance: number };
export type CustomerLedger = { customer: Customer; balance: string; opening: number; closing: number; totalDebit: number; totalCredit: number; entries: LedgerEntry[] };
export type VendorLedger = { vendor: Vendor; balance: string; opening: number; closing: number; totalDebit: number; totalCredit: number; entries: LedgerEntry[] };
export type AccountStatement = { account: Account; opening: string; closing: string; totalIn: string; totalOut: string; entries: AccountEntry[] };

// ── Expenses ──
export type ExpenseCategory = { id: string; name: string; _count?: { expenses: number } };
export type Expense = {
  id: string;
  refNo: string;
  categoryId: string;
  category?: { id: string; name: string };
  amount: string;
  date: string;
  notes: string | null;
  user?: { name: string };
  payment?: { id: string; method?: { name: string } } | null;
};

// ── Employees & salaries ──
export type Department = { id: string; name: string; _count?: { employees: number } };
export type Shift = { id: string; name: string; startTime: string; endTime: string; _count?: { employees: number } };
export type SalaryPayment = {
  id: string;
  refNo: string;
  employeeId: string;
  employee?: { id: string; code: string; name: string };
  month: string;
  baseAmount: string;
  bonus: string;
  deduction: string;
  netPaid: string;
  date: string;
  notes: string | null;
  user?: { name: string };
};
export type Employee = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  cnic: string | null;
  address: string | null;
  designation: string | null;
  photo: string | null;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  shiftId: string | null;
  shift?: { id: string; name: string } | null;
  joinDate: string;
  baseSalary: string;
  isActive: boolean;
  notes: string | null;
  salaries?: SalaryPayment[];
};
export type LeaveType = "PAID" | "UNPAID" | "SICK";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
export type LeaveRequest = {
  id: string;
  employeeId: string;
  employee?: { id: string; code: string; name: string };
  fromDate: string;
  toDate: string;
  days: number;
  type: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  approver?: { name: string } | null;
};
export type Holiday = { id: string; date: string; name: string };

// ── Reports ──
export type CashbookRow = { accountId: string; name: string; isCash: boolean; opening: string; moneyIn: string; moneyOut: string; closing: string };
export type Cashbook = { from: string; to: string; rows: CashbookRow[]; totals: { opening: string; moneyIn: string; moneyOut: string; closing: string } };
export type BalanceSheet = {
  assets: { cashBank: string; stockValue: string; receivables: string; vendorAdvances: string; total: string };
  liabilities: { payables: string; customerAdvances: string; total: string };
  equity: { capital: string; drawings: string; retainedEarnings: string; total: string };
  imbalance: number;
};
export type IntegrityCheck = { name: string; ok: boolean; detail: string };
export type IntegrityReport = { allGreen: boolean; checks: IntegrityCheck[]; balanceSheet: BalanceSheet };

// ── Generic report table (JSON that also drives PDF/Excel) ──
export type ReportColumn = { header: string; key: string; align?: "left" | "right"; money?: boolean };
export type ReportTable = {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
};

// ── Dashboard ──
export type DashboardData = {
  cards: { todaySales: string; monthSales: string; receivables: string; payables: string; cash: string; lowStock: number; todayProfit?: string; monthProfit?: string };
  salesSeries: { date: string; sales: number; profit?: number }[];
  categoryShare: { name: string; value: number }[];
  topProducts: { name: string; value: number }[];
  canProfit: boolean;
};

export type BusinessPresetInfo = {
  key: string;
  label: string;
  description: string;
  categoryNames: string[];
  unitNames: string[];
};

export type Paged<T extends string, V> = { total: number; page: number; pages: number } & Record<T, V[]>;
