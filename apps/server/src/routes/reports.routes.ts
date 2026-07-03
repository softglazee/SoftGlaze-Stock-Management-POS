/**
 * Reports. Phase 4 slice: integrity self-audit (CLAUDE rule 1), cash book, balance
 * sheet. Phase 5: dashboard + P&L, sales/purchase registers, stock valuation,
 * receivables/payables aging, expenses, sales-by-payment-method, stock movements —
 * each with JSON / PDF / Excel via sendReport(). Everything READ-ONLY and rebuilt
 * from the source ledgers so nothing can silently drift.
 */
import { Router } from "express";
import { Prisma, PaymentType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { paymentSign } from "../lib/accounts";
import { roleHasPermission } from "../lib/permissions";
import { sendReport, ReportDoc } from "../lib/report-export";

const router = Router();
router.use(requireAuth);

const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => new Prisma.Decimal(r2(v)).toDecimalPlaces(2);
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

async function loadSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((s) => [s.key, s.value]));
}

/** Resolve a from/to window (defaults to the last 30 days) + a label for the report. */
function periodOf(req: { query: Record<string, unknown> }) {
  const to = req.query.to ? new Date(String(req.query.to)) : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
  const from = req.query.from ? new Date(String(req.query.from)) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; })();
  const fmt = (d: Date) => d.toLocaleDateString("en-GB");
  return { from, to, label: `${fmt(from)} – ${fmt(to)}`, meta: [{ label: "Period", value: `${fmt(from)} to ${fmt(to)}` }] };
}
const fmtReq = (req: { query: Record<string, unknown> }) => String(req.query.format ?? "json");

// ─────────────────────────── INTEGRITY ───────────────────────────

/**
 * GET /reports/integrity — proves the books are internally consistent:
 *  1. stock ledger sums == Product.stockQty
 *  2. account ledger sums == PaymentMethod.currentBalance
 *  3. every Sale & Purchase: grandTotal == subTotal − discount + tax + otherCharges,
 *     and paidAmount + dueAmount == grandTotal
 *  4. customer receivables & vendor payables reconcile to their documents
 *  5. every Payment has a matching account ledger entry
 *  6. the balance sheet balances (Assets == Liabilities + Equity)
 */
router.get("/integrity", requirePermission("reports.view"), async (_req, res, next) => {
  try {
    const checks: { name: string; ok: boolean; detail: string }[] = [];

    // 1. Stock cache vs ledger
    const products = await prisma.product.findMany({ select: { id: true, name: true, stockQty: true, costPrice: true, type: true } });
    const stockSums = await prisma.stockMovement.groupBy({ by: ["productId"], _sum: { qty: true } });
    const stockMap = new Map(stockSums.map((s) => [s.productId, num(s._sum.qty)]));
    let stockBad = 0;
    let stockFirst = "";
    for (const p of products) {
      if (p.type !== "STANDARD") continue; // service/combo don't hold stock
      const ledger = r2(stockMap.get(p.id) ?? 0);
      if (r2(num(p.stockQty)) !== ledger) {
        stockBad++;
        if (!stockFirst) stockFirst = `${p.name}: cache ${num(p.stockQty)} vs ledger ${ledger}`;
      }
    }
    checks.push({ name: "Stock cache matches the stock ledger", ok: stockBad === 0, detail: stockBad === 0 ? `${products.length} products verified` : `${stockBad} mismatched — e.g. ${stockFirst}` });

    // 2. Account cache vs ledger
    const accounts = await prisma.paymentMethod.findMany({ select: { id: true, name: true, openingBalance: true, currentBalance: true } });
    const acctSums = await prisma.accountEntry.groupBy({ by: ["accountId"], _sum: { amount: true } });
    const acctMap = new Map(acctSums.map((a) => [a.accountId, num(a._sum.amount)]));
    let acctBad = 0;
    let acctFirst = "";
    for (const a of accounts) {
      const expected = r2(num(a.openingBalance) + (acctMap.get(a.id) ?? 0));
      if (r2(num(a.currentBalance)) !== expected) {
        acctBad++;
        if (!acctFirst) acctFirst = `${a.name}: cache ${num(a.currentBalance)} vs ledger ${expected}`;
      }
    }
    checks.push({ name: "Account balances match the money ledger", ok: acctBad === 0, detail: acctBad === 0 ? `${accounts.length} accounts verified` : `${acctBad} mismatched — e.g. ${acctFirst}` });

    // 3a. Sale math (return docs settle via balance/refund, so paid+due stays 0 for them)
    const sales = await prisma.sale.findMany({ where: { status: { in: ["COMPLETED", "RETURNED"] } }, select: { invoiceNo: true, isReturn: true, subTotal: true, discount: true, tax: true, otherCharges: true, grandTotal: true, paidAmount: true, dueAmount: true } });
    let saleBad = 0;
    let saleFirst = "";
    for (const s of sales) {
      const gt = r2(num(s.subTotal) - num(s.discount) + num(s.tax) + num(s.otherCharges));
      const pd = r2(num(s.paidAmount) + num(s.dueAmount));
      const badTotal = gt !== r2(num(s.grandTotal));
      const badPaid = !s.isReturn && pd !== r2(num(s.grandTotal));
      if (badTotal || badPaid) {
        saleBad++;
        if (!saleFirst) saleFirst = `${s.invoiceNo}: total ${num(s.grandTotal)} vs calc ${gt}, paid+due ${pd}`;
      }
    }
    checks.push({ name: "Every sale's totals add up", ok: saleBad === 0, detail: saleBad === 0 ? `${sales.length} sales verified` : `${saleBad} off — e.g. ${saleFirst}` });

    // 3b. Purchase math
    const purchases = await prisma.purchase.findMany({ where: { status: { in: ["RECEIVED", "RETURNED"] } }, select: { invoiceNo: true, isReturn: true, subTotal: true, discount: true, tax: true, otherCharges: true, grandTotal: true, paidAmount: true, dueAmount: true } });
    let purBad = 0;
    let purFirst = "";
    for (const p of purchases) {
      const gt = r2(num(p.subTotal) - num(p.discount) + num(p.tax) + num(p.otherCharges));
      const pd = r2(num(p.paidAmount) + num(p.dueAmount));
      const badTotal = gt !== r2(num(p.grandTotal));
      const badPaid = !p.isReturn && pd !== r2(num(p.grandTotal));
      if (badTotal || badPaid) {
        purBad++;
        if (!purFirst) purFirst = `${p.invoiceNo}: total ${num(p.grandTotal)} vs calc ${gt}, paid+due ${pd}`;
      }
    }
    checks.push({ name: "Every purchase's totals add up", ok: purBad === 0, detail: purBad === 0 ? `${purchases.length} purchases verified` : `${purBad} off — e.g. ${purFirst}` });

    // 4a. Customer receivables reconcile
    const customers = await prisma.customer.findMany({ select: { id: true, name: true, openingBalance: true, balance: true } });
    const [saleDebit, retCredit, custPay] = await Promise.all([
      prisma.sale.groupBy({ by: ["customerId"], where: { status: "COMPLETED", isReturn: false }, _sum: { grandTotal: true } }),
      prisma.sale.groupBy({ by: ["customerId"], where: { isReturn: true }, _sum: { grandTotal: true } }),
      prisma.payment.groupBy({ by: ["customerId", "type"], where: { customerId: { not: null } }, _sum: { amount: true } }),
    ]);
    const saleDebitMap = new Map(saleDebit.map((r) => [r.customerId, num(r._sum.grandTotal)]));
    const retCreditMap = new Map(retCredit.map((r) => [r.customerId, num(r._sum.grandTotal)]));
    const custPayMap = new Map<string, number>();
    for (const r of custPay) {
      const key = `${r.customerId}|${r.type}`;
      custPayMap.set(key, num(r._sum.amount));
    }
    let custBad = 0;
    let custFirst = "";
    for (const c of customers) {
      const debit = saleDebitMap.get(c.id) ?? 0;
      const credit = retCreditMap.get(c.id) ?? 0;
      const saleReceipt = custPayMap.get(`${c.id}|SALE_RECEIPT`) ?? 0;
      const custReceipt = custPayMap.get(`${c.id}|CUSTOMER_RECEIPT`) ?? 0;
      const refundOut = custPayMap.get(`${c.id}|REFUND_OUT`) ?? 0;
      const derived = r2(num(c.openingBalance) + debit - credit - saleReceipt - custReceipt + refundOut);
      if (derived !== r2(num(c.balance))) {
        custBad++;
        if (!custFirst) custFirst = `${c.name}: balance ${num(c.balance)} vs derived ${derived}`;
      }
    }
    checks.push({ name: "Customer balances reconcile to their invoices & receipts", ok: custBad === 0, detail: custBad === 0 ? `${customers.length} customers verified` : `${custBad} off — e.g. ${custFirst}` });

    // 4b. Vendor payables reconcile
    const vendors = await prisma.vendor.findMany({ select: { id: true, name: true, openingBalance: true, balance: true } });
    const [purCredit, purRetDebit, vendPay] = await Promise.all([
      prisma.purchase.groupBy({ by: ["vendorId"], where: { status: "RECEIVED", isReturn: false }, _sum: { grandTotal: true } }),
      prisma.purchase.groupBy({ by: ["vendorId"], where: { isReturn: true }, _sum: { grandTotal: true } }),
      prisma.payment.groupBy({ by: ["vendorId", "type"], where: { vendorId: { not: null } }, _sum: { amount: true } }),
    ]);
    const purCreditMap = new Map(purCredit.map((r) => [r.vendorId, num(r._sum.grandTotal)]));
    const purRetMap = new Map(purRetDebit.map((r) => [r.vendorId, num(r._sum.grandTotal)]));
    const vendPayMap = new Map<string, number>();
    for (const r of vendPay) vendPayMap.set(`${r.vendorId}|${r.type}`, num(r._sum.amount));
    let vendBad = 0;
    let vendFirst = "";
    for (const v of vendors) {
      const credit = purCreditMap.get(v.id) ?? 0;
      const retDebit = purRetMap.get(v.id) ?? 0;
      const purPay = vendPayMap.get(`${v.id}|PURCHASE_PAYMENT`) ?? 0;
      const vPay = vendPayMap.get(`${v.id}|VENDOR_PAYMENT`) ?? 0;
      const refundIn = vendPayMap.get(`${v.id}|REFUND_IN`) ?? 0;
      const derived = r2(num(v.openingBalance) + credit - retDebit - purPay - vPay + refundIn);
      if (derived !== r2(num(v.balance))) {
        vendBad++;
        if (!vendFirst) vendFirst = `${v.name}: balance ${num(v.balance)} vs derived ${derived}`;
      }
    }
    checks.push({ name: "Vendor balances reconcile to their bills & payments", ok: vendBad === 0, detail: vendBad === 0 ? `${vendors.length} vendors verified` : `${vendBad} off — e.g. ${vendFirst}` });

    // 5. Payments vs account ledger
    const payByType = await prisma.payment.groupBy({ by: ["type"], _sum: { amount: true } });
    const paySigned = r2(payByType.reduce((s, r) => s + num(r._sum.amount) * paymentSign(r.type as PaymentType), 0));
    const entryPay = await prisma.accountEntry.aggregate({ _sum: { amount: true }, where: { type: "PAYMENT" } });
    const entryPaySum = r2(num(entryPay._sum.amount));
    checks.push({ name: "Payments match their account ledger entries", ok: paySigned === entryPaySum, detail: `payments net ₨${paySigned} vs ledger ₨${entryPaySum}` });

    // 6. Balance sheet balances
    const bs = await computeBalanceSheet();
    checks.push({ name: "Balance sheet balances (Assets = Liabilities + Equity)", ok: Math.abs(bs.imbalance) < 1, detail: `Assets ₨${bs.assets.total} vs Liab+Equity ₨${r2(num(bs.liabilities.total) + num(bs.equity.total))} (diff ₨${bs.imbalance})` });

    const ok = checks.every((c) => c.ok);
    res.json({ ok: true, data: { allGreen: ok, checks, balanceSheet: bs } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── BALANCE SHEET ───────────────────────────

async function computeBalanceSheet() {
  const [accounts, products, customers, vendors, capital, salesProfit, retProfit, expenseAgg, purAgg, purItems, adjMoves, openAdvAgg] = await Promise.all([
    prisma.paymentMethod.findMany({ select: { currentBalance: true } }),
    prisma.product.findMany({ select: { stockQty: true, costPrice: true } }),
    prisma.customer.findMany({ select: { balance: true, openingBalance: true } }),
    prisma.vendor.findMany({ select: { balance: true, openingBalance: true } }),
    prisma.capitalEntry.groupBy({ by: ["direction"], _sum: { amount: true } }),
    prisma.sale.aggregate({ _sum: { profit: true }, where: { isReturn: false, status: "COMPLETED" } }),
    prisma.sale.aggregate({ _sum: { profit: true }, where: { isReturn: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.purchase.aggregate({ _sum: { grandTotal: true }, where: { status: "RECEIVED", isReturn: false } }),
    prisma.purchaseItem.findMany({ where: { purchase: { status: "RECEIVED", isReturn: false } }, select: { qty: true, unitCost: true } }),
    prisma.stockMovement.findMany({ where: { type: { in: ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE"] } }, select: { qty: true, unitCost: true } }),
    prisma.employeeAdvance.aggregate({ _sum: { amount: true }, where: { recoveredInId: null } }),
  ]);

  const cashBank = r2(accounts.reduce((s, a) => s + num(a.currentBalance), 0));
  const stockValue = r2(products.reduce((s, p) => s + num(p.stockQty) * num(p.costPrice), 0));
  const receivables = r2(customers.reduce((s, c) => s + Math.max(num(c.balance), 0), 0));
  const customerAdvances = r2(customers.reduce((s, c) => s + Math.max(-num(c.balance), 0), 0));
  const payables = r2(vendors.reduce((s, v) => s + Math.max(num(v.balance), 0), 0));
  const vendorAdvances = r2(vendors.reduce((s, v) => s + Math.max(-num(v.balance), 0), 0));
  // Open staff advances are cash out that will be recovered from salary — a receivable
  // (asset), never an expense. Without this line the sheet is short by the advance value.
  const employeeAdvances = r2(num(openAdvAgg._sum.amount));

  const capitalIn = r2(num(capital.find((c) => c.direction === "CAPITAL_IN")?._sum.amount));
  const drawings = r2(num(capital.find((c) => c.direction === "DRAWING")?._sum.amount));

  // Opening customer/vendor balances (money owed from BEFORE the shop started on the
  // system) are opening assets/liabilities — their counterpart is the owner's OPENING
  // CAPITAL (equity), same idea as opening stock. Net = opening receivables − opening
  // payables. Without this the sheet is off by that net whenever opening balances exist.
  const openingPartyCapital = r2(
    customers.reduce((s, c) => s + num(c.openingBalance), 0) - vendors.reduce((s, v) => s + num(v.openingBalance), 0)
  );

  // Inventory value implied by the stock ledger (each movement at its recorded cost).
  // Differs from stockValue (stockQty×current cost) only by manual cost-price
  // revaluations and weighted-avg rounding — recognise that difference in equity so
  // the sheet balances exactly regardless of price edits.
  const flowRows = await prisma.$queryRaw<{ v: Prisma.Decimal | null }[]>`SELECT COALESCE(SUM("qty" * "unitCost"), 0) AS v FROM "StockMovement" WHERE "unitCost" IS NOT NULL`;
  const flowInventoryValue = r2(num(flowRows[0]?.v));

  // Opening stock entered at product creation is inventory the owner already had —
  // its double-entry counterpart is the owner's OPENING CAPITAL (equity), not profit.
  // Without this the sheet is short by the opening-stock value (Assets > Liab+Equity).
  const openingRows = await prisma.$queryRaw<{ v: Prisma.Decimal | null }[]>`SELECT COALESCE(SUM("qty" * "unitCost"), 0) AS v FROM "StockMovement" WHERE "type" = 'OPENING'`;
  const openingStockValue = r2(num(openingRows[0]?.v));

  const salesNetProfit = r2(num(salesProfit._sum.profit) - num(retProfit._sum.profit));
  const totalExpenses = r2(num(expenseAgg._sum.amount));
  const inventoryValueAdded = r2(purItems.reduce((s, it) => s + num(it.qty) * num(it.unitCost), 0));
  const purchaseGap = r2(num(purAgg._sum.grandTotal) - inventoryValueAdded); // freight + tax − discounts on bills
  const adjustmentValue = r2(adjMoves.reduce((s, m) => s + num(m.qty) * num(m.unitCost), 0));
  const revaluation = r2(stockValue - flowInventoryValue); // manual cost edits + rounding
  const retainedEarnings = r2(salesNetProfit - totalExpenses - purchaseGap + adjustmentValue + revaluation);

  const assetsTotal = r2(cashBank + stockValue + receivables + vendorAdvances + employeeAdvances);
  const liabilitiesTotal = r2(payables + customerAdvances);
  const equityTotal = r2(capitalIn - drawings + retainedEarnings + openingStockValue + openingPartyCapital);
  const imbalance = r2(assetsTotal - (liabilitiesTotal + equityTotal));

  return {
    assets: { cashBank: money(cashBank), stockValue: money(stockValue), receivables: money(receivables), vendorAdvances: money(vendorAdvances), employeeAdvances: money(employeeAdvances), total: money(assetsTotal) },
    liabilities: { payables: money(payables), customerAdvances: money(customerAdvances), total: money(liabilitiesTotal) },
    equity: { capital: money(capitalIn), openingStock: money(openingStockValue), openingBalances: money(openingPartyCapital), drawings: money(drawings), retainedEarnings: money(retainedEarnings), total: money(equityTotal) },
    imbalance,
  };
}

/** GET /reports/balance-sheet */
router.get("/balance-sheet", requirePermission("reports.view"), async (_req, res, next) => {
  try {
    const balanceSheet = await computeBalanceSheet();
    res.json({ ok: true, data: { balanceSheet } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── CASH BOOK / DAY CLOSE ───────────────────────────

/** GET /reports/cashbook?from&to — per-account opening / in / out / closing for a period */
router.get("/cashbook", requirePermission("accounts.view"), async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : startOfToday();
    const to = req.query.to ? new Date(String(req.query.to)) : endOfToday();

    const accounts = await prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const rows = await Promise.all(
      accounts.map(async (a) => {
        const [priorAgg, inAgg, outAgg] = await Promise.all([
          prisma.accountEntry.aggregate({ _sum: { amount: true }, where: { accountId: a.id, date: { lt: from } } }),
          prisma.accountEntry.aggregate({ _sum: { amount: true }, where: { accountId: a.id, date: { gte: from, lte: to }, amount: { gt: 0 } } }),
          prisma.accountEntry.aggregate({ _sum: { amount: true }, where: { accountId: a.id, date: { gte: from, lte: to }, amount: { lt: 0 } } }),
        ]);
        const opening = r2(num(a.openingBalance) + num(priorAgg._sum.amount));
        const moneyIn = r2(num(inAgg._sum.amount));
        const moneyOut = r2(-num(outAgg._sum.amount));
        const closing = r2(opening + moneyIn - moneyOut);
        return { accountId: a.id, name: a.name, isCash: a.isCash, opening: money(opening), moneyIn: money(moneyIn), moneyOut: money(moneyOut), closing: money(closing) };
      })
    );
    const totals = {
      opening: money(rows.reduce((s, r) => s + num(r.opening), 0)),
      moneyIn: money(rows.reduce((s, r) => s + num(r.moneyIn), 0)),
      moneyOut: money(rows.reduce((s, r) => s + num(r.moneyOut), 0)),
      closing: money(rows.reduce((s, r) => s + num(r.closing), 0)),
    };

    const format = fmtReq(req);
    if (format !== "json") {
      const fmt = (d: Date) => d.toLocaleDateString("en-GB");
      const doc: ReportDoc = {
        title: "Cash Book",
        meta: [{ label: "Period", value: `${fmt(from)} to ${fmt(to)}` }],
        columns: [
          { header: "Account", key: "name" },
          { header: "Opening", key: "opening", align: "right", money: true },
          { header: "Money in", key: "moneyIn", align: "right", money: true },
          { header: "Money out", key: "moneyOut", align: "right", money: true },
          { header: "Closing", key: "closing", align: "right", money: true },
        ],
        rows: rows.map((r) => ({ name: r.name, opening: num(r.opening), moneyIn: num(r.moneyIn), moneyOut: num(r.moneyOut), closing: num(r.closing) })),
        totals: { name: "Total", opening: num(totals.opening), moneyIn: num(totals.moneyIn), moneyOut: num(totals.moneyOut), closing: num(totals.closing) },
      };
      return sendReport(res, format, "cash-book", doc, await loadSettings());
    }
    res.json({ ok: true, data: { from, to, rows, totals } });
  } catch (err) {
    next(err);
  }
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─────────────────────────── PROFIT & LOSS ───────────────────────────

/** GET /reports/profit-loss?from&to[&format] — accrual P&L for the period */
router.get("/profit-loss", requirePermission("reports.profit"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const where = { date: { gte: from, lte: to } } as const;
    const [salesAgg, retAgg, expByCat] = await Promise.all([
      prisma.sale.aggregate({ _sum: { grandTotal: true, totalCost: true, profit: true }, where: { ...where, status: "COMPLETED", isReturn: false } }),
      prisma.sale.aggregate({ _sum: { grandTotal: true, totalCost: true, profit: true }, where: { ...where, isReturn: true } }),
      prisma.expense.groupBy({ by: ["categoryId"], _sum: { amount: true }, where }),
    ]);
    const cats = await prisma.expenseCategory.findMany({ where: { id: { in: expByCat.map((e) => e.categoryId) } }, select: { id: true, name: true } });
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    const revenue = num(salesAgg._sum.grandTotal);
    const returns = num(retAgg._sum.grandTotal);
    const netSales = r2(revenue - returns);
    const cogs = r2(num(salesAgg._sum.totalCost) - num(retAgg._sum.totalCost));
    const grossProfit = r2(netSales - cogs);
    const expenseRows = expByCat.map((e) => ({ label: `  ${catName.get(e.categoryId) ?? "Expense"}`, amount: -num(e._sum.amount) })).sort((a, b) => a.amount - b.amount);
    const totalExpenses = r2(expByCat.reduce((s, e) => s + num(e._sum.amount), 0));
    const netProfit = r2(grossProfit - totalExpenses);

    const doc: ReportDoc = {
      title: "Profit & Loss",
      meta,
      columns: [{ header: "", key: "label" }, { header: "Amount", key: "amount", align: "right", money: true }],
      rows: [
        { label: "Sales revenue", amount: revenue },
        { label: "Less: Sales returns", amount: -returns },
        { label: "Net sales", amount: netSales },
        { label: "Less: Cost of goods sold", amount: -cogs },
        { label: "Gross profit", amount: grossProfit },
        { label: "Expenses:", amount: null },
        ...expenseRows,
        { label: "Total expenses", amount: -totalExpenses },
      ],
      totals: { label: "Net profit", amount: netProfit },
    };
    return sendReport(res, fmtReq(req), "profit-and-loss", doc, await loadSettings(), { summary: { revenue, returns, netSales, cogs, grossProfit, totalExpenses, netProfit } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── SALES / PURCHASE REGISTERS ───────────────────────────

/** GET /reports/sales?from&to[&format] — sales register */
router.get("/sales", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const canProfit = await roleHasPermission(req.user!.role, "reports.profit");
    const customerId = String(req.query.customerId ?? "");
    const productId = String(req.query.productId ?? "");
    const categoryId = String(req.query.categoryId ?? "");
    const settings = await loadSettings();

    // Product / category filter → line-item breakdown (each row is a sale line).
    if (productId || categoryId) {
      const items = await prisma.saleItem.findMany({
        where: {
          sale: { date: { gte: from, lte: to }, status: "COMPLETED", isReturn: false, ...(customerId ? { customerId } : {}) },
          ...(productId ? { productId } : {}),
          ...(categoryId ? { product: { categoryId } } : {}),
        },
        select: { qty: true, unitPrice: true, discount: true, unitCost: true, total: true, product: { select: { name: true, category: { select: { name: true } } } }, sale: { select: { date: true, invoiceNo: true, customer: { select: { name: true } } } } },
        orderBy: { sale: { date: "asc" } },
      });
      const columns = [
        { header: "Date", key: "date" },
        { header: "Invoice", key: "invoiceNo" },
        { header: "Customer", key: "customer" },
        { header: "Product", key: "product" },
        { header: "Qty", key: "qty", align: "right" as const },
        { header: "Price", key: "unitPrice", align: "right" as const, money: true },
        { header: "Total", key: "total", align: "right" as const, money: true },
        ...(canProfit ? [{ header: "Profit", key: "profit", align: "right" as const, money: true }] : []),
      ];
      const rows = items.map((it) => ({ date: it.sale.date.toLocaleDateString("en-GB"), invoiceNo: it.sale.invoiceNo, customer: it.sale.customer?.name ?? "Walk-in", product: it.product.name, qty: num(it.qty), unitPrice: num(it.unitPrice), total: num(it.total), ...(canProfit ? { profit: r2(num(it.total) - num(it.qty) * num(it.unitCost)) } : {}) }));
      const totals: any = { date: "Total", qty: r2(rows.reduce((a, r) => a + r.qty, 0)), total: r2(rows.reduce((a, r) => a + r.total, 0)) };
      if (canProfit) totals.profit = r2(rows.reduce((a, r) => a + (r.profit ?? 0), 0));
      return sendReport(res, fmtReq(req), "sales-by-item", { title: "Sales by Item", meta, columns, rows, totals }, settings);
    }

    // Otherwise the invoice-level register (optionally for one customer).
    const sales = await prisma.sale.findMany({
      where: { date: { gte: from, lte: to }, status: "COMPLETED", isReturn: false, ...(customerId ? { customerId } : {}) },
      select: { date: true, invoiceNo: true, grandTotal: true, paidAmount: true, dueAmount: true, profit: true, customer: { select: { name: true } } },
      orderBy: { date: "asc" },
    });
    const columns = [
      { header: "Date", key: "date" },
      { header: "Invoice", key: "invoiceNo" },
      { header: "Customer", key: "customer" },
      { header: "Total", key: "grandTotal", align: "right" as const, money: true },
      { header: "Paid", key: "paidAmount", align: "right" as const, money: true },
      { header: "Due", key: "dueAmount", align: "right" as const, money: true },
      ...(canProfit ? [{ header: "Profit", key: "profit", align: "right" as const, money: true }] : []),
    ];
    const rows = sales.map((s) => ({ date: s.date.toLocaleDateString("en-GB"), invoiceNo: s.invoiceNo, customer: s.customer?.name ?? "Walk-in", grandTotal: num(s.grandTotal), paidAmount: num(s.paidAmount), dueAmount: num(s.dueAmount), ...(canProfit ? { profit: num(s.profit) } : {}) }));
    const totals: any = { date: "Total", grandTotal: r2(rows.reduce((a, r) => a + r.grandTotal, 0)), paidAmount: r2(rows.reduce((a, r) => a + r.paidAmount, 0)), dueAmount: r2(rows.reduce((a, r) => a + r.dueAmount, 0)) };
    if (canProfit) totals.profit = r2(rows.reduce((a, r) => a + (r.profit ?? 0), 0));
    return sendReport(res, fmtReq(req), "sales-register", { title: "Sales Register", meta, columns, rows, totals }, settings);
  } catch (err) {
    next(err);
  }
});

/** GET /reports/purchases?from&to[&format] — purchase register */
router.get("/purchases", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const purchases = await prisma.purchase.findMany({
      where: { date: { gte: from, lte: to }, status: "RECEIVED", isReturn: false },
      select: { date: true, invoiceNo: true, grandTotal: true, paidAmount: true, dueAmount: true, vendor: { select: { name: true } } },
      orderBy: { date: "asc" },
    });
    const columns = [
      { header: "Date", key: "date" },
      { header: "Invoice", key: "invoiceNo" },
      { header: "Vendor", key: "vendor" },
      { header: "Total", key: "grandTotal", align: "right" as const, money: true },
      { header: "Paid", key: "paidAmount", align: "right" as const, money: true },
      { header: "Due", key: "dueAmount", align: "right" as const, money: true },
    ];
    const rows = purchases.map((p) => ({ date: p.date.toLocaleDateString("en-GB"), invoiceNo: p.invoiceNo, vendor: p.vendor?.name ?? "—", grandTotal: num(p.grandTotal), paidAmount: num(p.paidAmount), dueAmount: num(p.dueAmount) }));
    const totals = { date: "Total", grandTotal: r2(rows.reduce((a, r) => a + r.grandTotal, 0)), paidAmount: r2(rows.reduce((a, r) => a + r.paidAmount, 0)), dueAmount: r2(rows.reduce((a, r) => a + r.dueAmount, 0)) };
    return sendReport(res, fmtReq(req), "purchase-register", { title: "Purchase Register", meta, columns, rows, totals }, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── STOCK VALUATION ───────────────────────────

/** GET /reports/stock-valuation?basis=cost|sale[&format] */
router.get("/stock-valuation", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const basis = String(req.query.basis ?? "cost") === "sale" ? "sale" : "cost";
    if (basis === "cost") {
      const canProfit = await roleHasPermission(req.user!.role, "reports.profit");
      if (!canProfit) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Cost valuation needs profit permission — try the sale-price basis" } });
    }
    const products = await prisma.product.findMany({ where: { isActive: true, type: "STANDARD" }, select: { sku: true, name: true, stockQty: true, costPrice: true, salePrice: true }, orderBy: { name: "asc" } });
    const rows = products.map((p) => {
      const qty = num(p.stockQty);
      const unit = basis === "cost" ? num(p.costPrice) : num(p.salePrice);
      return { sku: p.sku, name: p.name, qty, unit, value: r2(qty * unit) };
    });
    const doc: ReportDoc = {
      title: `Stock Valuation (at ${basis === "cost" ? "cost" : "sale price"})`,
      meta: [{ label: "As of", value: new Date().toLocaleDateString("en-GB") }],
      columns: [
        { header: "SKU", key: "sku" },
        { header: "Product", key: "name" },
        { header: "Qty", key: "qty", align: "right" },
        { header: basis === "cost" ? "Unit cost" : "Sale price", key: "unit", align: "right", money: true },
        { header: "Value", key: "value", align: "right", money: true },
      ],
      rows,
      totals: { sku: "Total", value: r2(rows.reduce((a, r) => a + r.value, 0)) },
    };
    return sendReport(res, fmtReq(req), `stock-valuation-${basis}`, doc, await loadSettings(), { totalValue: r2(rows.reduce((a, r) => a + r.value, 0)) });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── AGING (receivables & payables) ───────────────────────────

function agingBuckets(balance: number, charges: { date: Date; amount: number }[]) {
  const now = Date.now();
  const b = { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
  const sorted = [...charges].sort((a, z) => z.date.getTime() - a.date.getTime()); // newest first
  let rem = balance;
  for (const c of sorted) {
    if (rem <= 0.005) break;
    const amt = Math.min(rem, c.amount);
    const days = (now - c.date.getTime()) / 86400000;
    if (days <= 30) b.b0_30 += amt; else if (days <= 60) b.b31_60 += amt; else if (days <= 90) b.b61_90 += amt; else b.b90p += amt;
    rem -= amt;
  }
  if (rem > 0.005) b.b90p += rem; // fallback: unattributed balance is treated as oldest
  return { b0_30: r2(b.b0_30), b31_60: r2(b.b31_60), b61_90: r2(b.b61_90), b90p: r2(b.b90p) };
}

/** GET /reports/receivables[&format] — customer receivable aging */
router.get("/receivables", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({ where: { balance: { gt: 0 } }, select: { id: true, code: true, name: true, phone: true, balance: true, openingBalance: true, createdAt: true }, orderBy: { balance: "desc" } });
    const sales = await prisma.sale.findMany({ where: { customerId: { in: customers.map((c) => c.id) }, status: "COMPLETED", isReturn: false, dueAmount: { gt: 0 } }, select: { customerId: true, date: true, dueAmount: true } });
    const byCust = new Map<string, { date: Date; amount: number }[]>();
    for (const c of customers) byCust.set(c.id, num(c.openingBalance) > 0 ? [{ date: c.createdAt, amount: num(c.openingBalance) }] : []);
    for (const s of sales) byCust.get(s.customerId!)?.push({ date: s.date, amount: num(s.dueAmount) });

    const rows = customers.map((c) => { const a = agingBuckets(num(c.balance), byCust.get(c.id) ?? []); return { code: c.code, name: c.name, phone: c.phone ?? "", ...a, total: num(c.balance) }; });
    const sum = (k: string) => r2(rows.reduce((a, r) => a + (r as any)[k], 0));
    const doc: ReportDoc = {
      title: "Receivables Aging",
      meta: [{ label: "As of", value: new Date().toLocaleDateString("en-GB") }],
      columns: [
        { header: "Code", key: "code" }, { header: "Customer", key: "name" }, { header: "Phone", key: "phone" },
        { header: "0–30", key: "b0_30", align: "right", money: true }, { header: "31–60", key: "b31_60", align: "right", money: true },
        { header: "61–90", key: "b61_90", align: "right", money: true }, { header: "90+", key: "b90p", align: "right", money: true },
        { header: "Total", key: "total", align: "right", money: true },
      ],
      rows,
      totals: { code: "Total", b0_30: sum("b0_30"), b31_60: sum("b31_60"), b61_90: sum("b61_90"), b90p: sum("b90p"), total: sum("total") },
    };
    return sendReport(res, fmtReq(req), "receivables-aging", doc, await loadSettings(), { buckets: doc.totals });
  } catch (err) {
    next(err);
  }
});

/** GET /reports/payables[&format] — vendor payable aging */
router.get("/payables", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({ where: { balance: { gt: 0 } }, select: { id: true, code: true, name: true, phone: true, balance: true, openingBalance: true, createdAt: true }, orderBy: { balance: "desc" } });
    const purchases = await prisma.purchase.findMany({ where: { vendorId: { in: vendors.map((v) => v.id) }, status: "RECEIVED", isReturn: false, dueAmount: { gt: 0 } }, select: { vendorId: true, date: true, dueAmount: true } });
    const byVend = new Map<string, { date: Date; amount: number }[]>();
    for (const v of vendors) byVend.set(v.id, num(v.openingBalance) > 0 ? [{ date: v.createdAt, amount: num(v.openingBalance) }] : []);
    for (const p of purchases) byVend.get(p.vendorId)?.push({ date: p.date, amount: num(p.dueAmount) });

    const rows = vendors.map((v) => { const a = agingBuckets(num(v.balance), byVend.get(v.id) ?? []); return { code: v.code, name: v.name, phone: v.phone ?? "", ...a, total: num(v.balance) }; });
    const sum = (k: string) => r2(rows.reduce((a, r) => a + (r as any)[k], 0));
    const doc: ReportDoc = {
      title: "Payables Aging",
      meta: [{ label: "As of", value: new Date().toLocaleDateString("en-GB") }],
      columns: [
        { header: "Code", key: "code" }, { header: "Vendor", key: "name" }, { header: "Phone", key: "phone" },
        { header: "0–30", key: "b0_30", align: "right", money: true }, { header: "31–60", key: "b31_60", align: "right", money: true },
        { header: "61–90", key: "b61_90", align: "right", money: true }, { header: "90+", key: "b90p", align: "right", money: true },
        { header: "Total", key: "total", align: "right", money: true },
      ],
      rows,
      totals: { code: "Total", b0_30: sum("b0_30"), b31_60: sum("b31_60"), b61_90: sum("b61_90"), b90p: sum("b90p"), total: sum("total") },
    };
    return sendReport(res, fmtReq(req), "payables-aging", doc, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── EXPENSES & PAYMENT-METHOD ───────────────────────────

/** GET /reports/expenses?from&to[&format] — expenses by category */
router.get("/expenses", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const grouped = await prisma.expense.groupBy({ by: ["categoryId"], _sum: { amount: true }, _count: true, where: { date: { gte: from, lte: to } } });
    const cats = await prisma.expenseCategory.findMany({ where: { id: { in: grouped.map((g) => g.categoryId) } }, select: { id: true, name: true } });
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const rows = grouped.map((g) => ({ category: catName.get(g.categoryId) ?? "—", count: g._count, amount: num(g._sum.amount) })).sort((a, b) => b.amount - a.amount);
    const doc: ReportDoc = {
      title: "Expenses by Category",
      meta,
      columns: [{ header: "Category", key: "category" }, { header: "Count", key: "count", align: "right" }, { header: "Amount", key: "amount", align: "right", money: true }],
      rows,
      totals: { category: "Total", count: rows.reduce((a, r) => a + r.count, 0), amount: r2(rows.reduce((a, r) => a + r.amount, 0)) },
    };
    return sendReport(res, fmtReq(req), "expenses-by-category", doc, await loadSettings());
  } catch (err) {
    next(err);
  }
});

/** GET /reports/sales-by-payment-method?from&to[&format] (G10) */
router.get("/sales-by-payment-method", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const grouped = await prisma.payment.groupBy({ by: ["methodId"], _sum: { amount: true }, _count: true, where: { type: "SALE_RECEIPT", date: { gte: from, lte: to } } });
    const methods = await prisma.paymentMethod.findMany({ where: { id: { in: grouped.map((g) => g.methodId) } }, select: { id: true, name: true } });
    const mName = new Map(methods.map((m) => [m.id, m.name]));
    const rows = grouped.map((g) => ({ method: mName.get(g.methodId) ?? "—", count: g._count, amount: num(g._sum.amount) })).sort((a, b) => b.amount - a.amount);
    const doc: ReportDoc = {
      title: "Sales by Payment Method",
      meta,
      columns: [{ header: "Account / method", key: "method" }, { header: "Payments", key: "count", align: "right" }, { header: "Amount", key: "amount", align: "right", money: true }],
      rows,
      totals: { method: "Total", count: rows.reduce((a, r) => a + r.count, 0), amount: r2(rows.reduce((a, r) => a + r.amount, 0)) },
    };
    return sendReport(res, fmtReq(req), "sales-by-payment-method", doc, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── STOCK MOVEMENTS ───────────────────────────

/** GET /reports/stock-movements?from&to&productId[&format] */
router.get("/stock-movements", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const productId = String(req.query.productId ?? "");
    const moves = await prisma.stockMovement.findMany({
      where: { date: { gte: from, lte: to }, ...(productId ? { productId } : {}) },
      select: { date: true, type: true, qty: true, balance: true, notes: true, product: { select: { name: true, sku: true } } },
      orderBy: { date: "asc" },
      take: 5000,
    });
    const rows = moves.map((m) => ({ date: m.date.toLocaleDateString("en-GB"), product: `${m.product.name} (${m.product.sku})`, type: m.type.replace("_", " "), qty: num(m.qty), balance: num(m.balance), notes: m.notes ?? "" }));
    const doc: ReportDoc = {
      title: "Stock Movements",
      meta,
      columns: [{ header: "Date", key: "date" }, { header: "Product", key: "product" }, { header: "Type", key: "type" }, { header: "Qty", key: "qty", align: "right" }, { header: "Balance", key: "balance", align: "right" }, { header: "Note", key: "notes" }],
      rows,
    };
    return sendReport(res, fmtReq(req), "stock-movements", doc, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── DASHBOARD ───────────────────────────

/** GET /reports/dashboard — KPI cards + chart series */
router.get("/dashboard", requirePermission("reports.view", "sales.view_own"), async (req, res, next) => {
  try {
    const canProfit = await roleHasPermission(req.user!.role, "reports.profit");
    const todayStart = startOfToday();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const win = new Date(); win.setDate(win.getDate() - 29); win.setHours(0, 0, 0, 0);

    const [todayAgg, monthAgg, recv, pay, accounts, lowStock, series, catItems, prodItems, recentSales, lowStockItems] = await Promise.all([
      prisma.sale.aggregate({ _sum: { grandTotal: true, profit: true }, where: { status: "COMPLETED", isReturn: false, date: { gte: todayStart } } }),
      prisma.sale.aggregate({ _sum: { grandTotal: true, profit: true }, where: { status: "COMPLETED", isReturn: false, date: { gte: monthStart } } }),
      prisma.customer.aggregate({ _sum: { balance: true }, where: { balance: { gt: 0 } } }),
      prisma.vendor.aggregate({ _sum: { balance: true }, where: { balance: { gt: 0 } } }),
      prisma.paymentMethod.findMany({ where: { isActive: true }, select: { currentBalance: true, isCash: true } }),
      prisma.product.count({ where: { isActive: true, type: "STANDARD", minStockLevel: { gt: 0 }, stockQty: { lte: prisma.product.fields.minStockLevel } } }),
      prisma.sale.findMany({ where: { status: "COMPLETED", isReturn: false, date: { gte: win } }, select: { date: true, grandTotal: true, profit: true } }),
      prisma.saleItem.findMany({ where: { sale: { status: "COMPLETED", isReturn: false, date: { gte: win } } }, select: { total: true, product: { select: { category: { select: { name: true } } } } } }),
      prisma.saleItem.findMany({ where: { sale: { status: "COMPLETED", isReturn: false, date: { gte: win } } }, select: { total: true, qty: true, product: { select: { name: true } } } }),
      prisma.sale.findMany({ where: { status: "COMPLETED", isReturn: false }, orderBy: { date: "desc" }, take: 8, select: { id: true, invoiceNo: true, date: true, grandTotal: true, dueAmount: true, customer: { select: { name: true } } } }),
      prisma.product.findMany({ where: { isActive: true, type: "STANDARD", minStockLevel: { gt: 0 }, stockQty: { lte: prisma.product.fields.minStockLevel } }, orderBy: { stockQty: "asc" }, take: 8, select: { id: true, name: true, stockQty: true, minStockLevel: true, unit: { select: { shortName: true } } } }),
    ]);

    // 30-day series (fill gaps). Bucket by LOCAL date on both sides so today lands
    // in today's bucket regardless of the server's timezone offset.
    const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayMap = new Map<string, { sales: number; profit: number }>();
    for (let i = 0; i < 30; i++) { const d = new Date(win); d.setDate(win.getDate() + i); dayMap.set(dayKey(d), { sales: 0, profit: 0 }); }
    for (const s of series) { const e = dayMap.get(dayKey(new Date(s.date))); if (e) { e.sales = r2(e.sales + num(s.grandTotal)); e.profit = r2(e.profit + num(s.profit)); } }
    const salesSeries = [...dayMap.entries()].map(([date, v]) => ({ date, sales: v.sales, ...(canProfit ? { profit: v.profit } : {}) }));

    // category share
    const catMap = new Map<string, number>();
    for (const it of catItems) { const n = it.product?.category?.name ?? "Other"; catMap.set(n, r2((catMap.get(n) ?? 0) + num(it.total))); }
    const categoryShare = [...catMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

    // top products
    const prodMap = new Map<string, number>();
    for (const it of prodItems) { const n = it.product?.name ?? "—"; prodMap.set(n, r2((prodMap.get(n) ?? 0) + num(it.total))); }
    const topProducts = [...prodMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);

    const cash = r2(accounts.reduce((s, a) => s + num(a.currentBalance), 0));

    res.json({
      ok: true,
      data: {
        cards: {
          todaySales: money(num(todayAgg._sum.grandTotal)),
          monthSales: money(num(monthAgg._sum.grandTotal)),
          receivables: money(num(recv._sum.balance)),
          payables: money(num(pay._sum.balance)),
          cash: money(cash),
          lowStock,
          ...(canProfit ? { todayProfit: money(num(todayAgg._sum.profit)), monthProfit: money(num(monthAgg._sum.profit)) } : {}),
        },
        salesSeries,
        categoryShare,
        topProducts,
        recentSales: recentSales.map((s) => ({ id: s.id, invoiceNo: s.invoiceNo, date: s.date, customer: s.customer?.name ?? "Walk-in", grandTotal: money(num(s.grandTotal)), dueAmount: money(num(s.dueAmount)) })),
        lowStockItems: lowStockItems.map((p) => ({ id: p.id, name: p.name, stockQty: num(p.stockQty), minStockLevel: num(p.minStockLevel), unit: p.unit?.shortName ?? "" })),
        canProfit,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── TOP CUSTOMERS ───────────────────────────

/** GET /reports/top-customers?from&to[&format] — customers ranked by sales in the period. */
router.get("/top-customers", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const canProfit = await roleHasPermission(req.user!.role, "reports.profit");
    const grouped = await prisma.sale.groupBy({
      by: ["customerId"],
      where: { date: { gte: from, lte: to }, status: "COMPLETED", isReturn: false, customerId: { not: null } },
      _sum: { grandTotal: true, profit: true, dueAmount: true },
      _count: { _all: true },
    });
    const custs = await prisma.customer.findMany({ where: { id: { in: grouped.map((g) => g.customerId!).filter(Boolean) } }, select: { id: true, name: true } });
    const nameById = new Map(custs.map((c) => [c.id, c.name]));
    const columns = [
      { header: "Customer", key: "customer" },
      { header: "Bills", key: "bills", align: "right" as const },
      { header: "Sales", key: "sales", align: "right" as const, money: true },
      { header: "Outstanding", key: "due", align: "right" as const, money: true },
      ...(canProfit ? [{ header: "Profit", key: "profit", align: "right" as const, money: true }] : []),
    ];
    const rows = grouped
      .map((g) => ({ customer: nameById.get(g.customerId!) ?? "—", bills: g._count._all, sales: num(g._sum.grandTotal), due: num(g._sum.dueAmount), ...(canProfit ? { profit: num(g._sum.profit) } : {}) }))
      .sort((a, b) => b.sales - a.sales);
    const totals: any = { customer: "Total", bills: rows.reduce((a, r) => a + r.bills, 0), sales: r2(rows.reduce((a, r) => a + r.sales, 0)), due: r2(rows.reduce((a, r) => a + r.due, 0)) };
    if (canProfit) totals.profit = r2(rows.reduce((a, r) => a + (r.profit ?? 0), 0));
    return sendReport(res, fmtReq(req), "top-customers", { title: "Top Customers", meta, columns, rows, totals }, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── SALARY REGISTER ───────────────────────────

/** GET /reports/salaries?from&to[&month][&employeeId][&format] — salaries paid, with PDF/Excel. */
router.get("/salaries", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const { from, to, meta } = periodOf(req);
    const month = String(req.query.month ?? "");
    const employeeId = String(req.query.employeeId ?? "");
    const where: Prisma.SalaryPaymentWhereInput = month ? { month } : { date: { gte: from, lte: to } };
    if (employeeId) where.employeeId = employeeId;
    const pays = await prisma.salaryPayment.findMany({
      where,
      select: { refNo: true, month: true, date: true, baseAmount: true, bonus: true, deduction: true, absentDeduction: true, advanceRecovered: true, netPaid: true, employee: { select: { name: true, code: true } } },
      orderBy: { date: "desc" },
    });
    const columns = [
      { header: "Ref", key: "refNo" },
      { header: "Date", key: "date" },
      { header: "Employee", key: "employee" },
      { header: "Month", key: "month" },
      { header: "Base", key: "baseAmount", align: "right" as const, money: true },
      { header: "Bonus", key: "bonus", align: "right" as const, money: true },
      { header: "Deduction", key: "deduction", align: "right" as const, money: true },
      { header: "Advance", key: "advanceRecovered", align: "right" as const, money: true },
      { header: "Net paid", key: "netPaid", align: "right" as const, money: true },
    ];
    // "Deduction" column shows the wage-reducing deductions (penalty + absent); advance
    // recovery is shown separately so base + bonus − deduction − advance = net paid.
    const rows = pays.map((p) => ({ refNo: p.refNo, date: p.date.toLocaleDateString("en-GB"), employee: `${p.employee.name} (${p.employee.code})`, month: p.month, baseAmount: num(p.baseAmount), bonus: num(p.bonus), deduction: r2(num(p.deduction) + num(p.absentDeduction)), advanceRecovered: num(p.advanceRecovered), netPaid: num(p.netPaid) }));
    const totals = { refNo: "Total", baseAmount: r2(rows.reduce((a, r) => a + r.baseAmount, 0)), bonus: r2(rows.reduce((a, r) => a + r.bonus, 0)), deduction: r2(rows.reduce((a, r) => a + r.deduction, 0)), advanceRecovered: r2(rows.reduce((a, r) => a + r.advanceRecovered, 0)), netPaid: r2(rows.reduce((a, r) => a + r.netPaid, 0)) };
    const metaFull = month ? [{ label: "Month", value: month }] : meta;
    return sendReport(res, fmtReq(req), "salary-register", { title: "Salary Register", meta: metaFull, columns, rows, totals }, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── PENDING DELIVERIES (F2) ───────────────────────────

/** GET /reports/pending-deliveries[&format] — sold items not yet fully dispatched. */
router.get("/pending-deliveries", requirePermission("reports.view", "sales.view_all"), async (req, res, next) => {
  try {
    const items = await prisma.saleItem.findMany({
      where: { sale: { status: "COMPLETED", isReturn: false }, product: { type: { not: "SERVICE" } } },
      select: { id: true, qty: true, product: { select: { name: true } }, sale: { select: { invoiceNo: true, date: true, customer: { select: { name: true } } } } },
      orderBy: { sale: { date: "asc" } },
    });
    const delivered = await prisma.deliveryNoteItem.groupBy({ by: ["saleItemId"], where: { deliveryNote: { status: "DELIVERED" } }, _sum: { qty: true } });
    const dmap = new Map(delivered.map((d) => [d.saleItemId, num(d._sum.qty)]));
    const rows = items
      .map((it) => { const sold = num(it.qty); const done = dmap.get(it.id) ?? 0; return { date: it.sale.date.toLocaleDateString("en-GB"), invoiceNo: it.sale.invoiceNo, customer: it.sale.customer?.name ?? "Walk-in", product: it.product.name, sold, delivered: done, pending: r2(sold - done) }; })
      .filter((r) => r.pending > 0.001);
    const columns = [
      { header: "Date", key: "date" },
      { header: "Invoice", key: "invoiceNo" },
      { header: "Customer", key: "customer" },
      { header: "Product", key: "product" },
      { header: "Sold", key: "sold", align: "right" as const },
      { header: "Delivered", key: "delivered", align: "right" as const },
      { header: "Pending", key: "pending", align: "right" as const },
    ];
    const totals = { date: "Total", sold: r2(rows.reduce((a, r) => a + r.sold, 0)), delivered: r2(rows.reduce((a, r) => a + r.delivered, 0)), pending: r2(rows.reduce((a, r) => a + r.pending, 0)) };
    return sendReport(res, fmtReq(req), "pending-deliveries", { title: "Pending Deliveries", meta: [{ label: "As of", value: new Date().toLocaleDateString("en-GB") }], columns, rows, totals }, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── OPEN BOOKINGS (F3) ───────────────────────────

/** GET /reports/open-bookings[&format] — live advance bookings, advances held, value still owed. */
router.get("/open-bookings", requirePermission("reports.view", "sales.view_all"), async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] } },
      include: { customer: { select: { name: true } }, items: { select: { qty: true, qtyFulfilled: true, unitPrice: true } } },
      orderBy: { date: "asc" },
    });
    const rows = bookings.map((b) => {
      const valueFulfilled = r2(b.items.reduce((s, it) => s + num(it.qtyFulfilled) * num(it.unitPrice), 0));
      const advanceRemaining = r2(Math.max(0, num(b.advanceReceived) - valueFulfilled));
      const outstanding = r2(num(b.bookedValue) - valueFulfilled);
      return {
        date: b.date.toLocaleDateString("en-GB"),
        refNo: b.refNo,
        customer: b.customer.name,
        status: b.status.toLowerCase(),
        validUntil: b.validUntil ? b.validUntil.toLocaleDateString("en-GB") : "—",
        booked: num(b.bookedValue),
        advanceHeld: advanceRemaining,
        outstanding,
      };
    });
    const columns = [
      { header: "Date", key: "date" },
      { header: "Booking", key: "refNo" },
      { header: "Customer", key: "customer" },
      { header: "Status", key: "status" },
      { header: "Rate valid till", key: "validUntil" },
      { header: "Booked value", key: "booked", align: "right" as const, money: true },
      { header: "Advance held", key: "advanceHeld", align: "right" as const, money: true },
      { header: "Still to deliver", key: "outstanding", align: "right" as const, money: true },
    ];
    const totals = {
      date: "Total",
      booked: r2(rows.reduce((a, r) => a + r.booked, 0)),
      advanceHeld: r2(rows.reduce((a, r) => a + r.advanceHeld, 0)),
      outstanding: r2(rows.reduce((a, r) => a + r.outstanding, 0)),
    };
    return sendReport(res, fmtReq(req), "open-bookings", { title: "Open Bookings", meta: [{ label: "As of", value: new Date().toLocaleDateString("en-GB") }], columns, rows, totals }, await loadSettings());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── ATTENDANCE SHEET (F5) ───────────────────────────

/** GET /reports/attendance-sheet?month=YYYY-MM[&format] — monthly P/A/H/L per employee. */
router.get("/attendance-sheet", requirePermission("employees.view", "reports.view"), async (req, res, next) => {
  try {
    const month = String(req.query.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "month must look like 2026-07" } });
    const [y, m] = month.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const [employees, grouped] = await Promise.all([
      prisma.employee.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      prisma.attendance.groupBy({ by: ["employeeId", "status"], where: { date: { gte: from, lte: to } }, _count: { _all: true } }),
    ]);
    const map = new Map<string, { present: number; absent: number; half: number; leave: number }>();
    for (const e of employees) map.set(e.id, { present: 0, absent: 0, half: 0, leave: 0 });
    for (const g of grouped) {
      const row = map.get(g.employeeId);
      if (!row) continue;
      if (g.status === "PRESENT") row.present = g._count._all;
      else if (g.status === "ABSENT") row.absent = g._count._all;
      else if (g.status === "HALF_DAY") row.half = g._count._all;
      else if (g.status === "LEAVE") row.leave = g._count._all;
    }
    const columns = [
      { header: "Employee", key: "employee" },
      { header: "Present", key: "present", align: "right" as const },
      { header: "Absent", key: "absent", align: "right" as const },
      { header: "Half day", key: "half", align: "right" as const },
      { header: "Leave", key: "leave", align: "right" as const },
      { header: "Marked", key: "marked", align: "right" as const },
    ];
    const rows = employees.map((e) => {
      const r = map.get(e.id)!;
      return { employee: `${e.name} (${e.code})`, present: r.present, absent: r.absent, half: r.half, leave: r.leave, marked: r.present + r.absent + r.half + r.leave };
    });
    const totals = {
      employee: "Total",
      present: rows.reduce((a, r) => a + r.present, 0),
      absent: rows.reduce((a, r) => a + r.absent, 0),
      half: rows.reduce((a, r) => a + r.half, 0),
      leave: rows.reduce((a, r) => a + r.leave, 0),
      marked: rows.reduce((a, r) => a + r.marked, 0),
    };
    return sendReport(res, fmtReq(req), "attendance-sheet", { title: "Attendance Sheet", meta: [{ label: "Month", value: month }], columns, rows, totals }, await loadSettings());
  } catch (err) {
    next(err);
  }
});

export default router;
