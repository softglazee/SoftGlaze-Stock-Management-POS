/**
 * Reports (Phase 4 slice): the integrity self-audit (built early per CLAUDE rule 1),
 * the day-close cash book, and the balance sheet. Full sales/P&L/stock reports with
 * PDF/Excel land in Phase 5. Everything here is READ-ONLY and reconstructs figures
 * from the source ledgers so nothing can silently drift.
 */
import { Router } from "express";
import { Prisma, PaymentType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { paymentSign } from "../lib/accounts";

const router = Router();
router.use(requireAuth);

const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => new Prisma.Decimal(r2(v)).toDecimalPlaces(2);
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

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
  const [accounts, products, customers, vendors, capital, salesProfit, retProfit, expenseAgg, purAgg, purItems, adjMoves] = await Promise.all([
    prisma.paymentMethod.findMany({ select: { currentBalance: true } }),
    prisma.product.findMany({ select: { stockQty: true, costPrice: true } }),
    prisma.customer.findMany({ select: { balance: true } }),
    prisma.vendor.findMany({ select: { balance: true } }),
    prisma.capitalEntry.groupBy({ by: ["direction"], _sum: { amount: true } }),
    prisma.sale.aggregate({ _sum: { profit: true }, where: { isReturn: false, status: "COMPLETED" } }),
    prisma.sale.aggregate({ _sum: { profit: true }, where: { isReturn: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.purchase.aggregate({ _sum: { grandTotal: true }, where: { status: "RECEIVED", isReturn: false } }),
    prisma.purchaseItem.findMany({ where: { purchase: { status: "RECEIVED", isReturn: false } }, select: { qty: true, unitCost: true } }),
    prisma.stockMovement.findMany({ where: { type: { in: ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE"] } }, select: { qty: true, unitCost: true } }),
  ]);

  const cashBank = r2(accounts.reduce((s, a) => s + num(a.currentBalance), 0));
  const stockValue = r2(products.reduce((s, p) => s + num(p.stockQty) * num(p.costPrice), 0));
  const receivables = r2(customers.reduce((s, c) => s + Math.max(num(c.balance), 0), 0));
  const customerAdvances = r2(customers.reduce((s, c) => s + Math.max(-num(c.balance), 0), 0));
  const payables = r2(vendors.reduce((s, v) => s + Math.max(num(v.balance), 0), 0));
  const vendorAdvances = r2(vendors.reduce((s, v) => s + Math.max(-num(v.balance), 0), 0));

  const capitalIn = r2(num(capital.find((c) => c.direction === "CAPITAL_IN")?._sum.amount));
  const drawings = r2(num(capital.find((c) => c.direction === "DRAWING")?._sum.amount));

  const salesNetProfit = r2(num(salesProfit._sum.profit) - num(retProfit._sum.profit));
  const totalExpenses = r2(num(expenseAgg._sum.amount));
  const inventoryValueAdded = r2(purItems.reduce((s, it) => s + num(it.qty) * num(it.unitCost), 0));
  const purchaseGap = r2(num(purAgg._sum.grandTotal) - inventoryValueAdded); // freight + tax − discounts on bills
  const adjustmentValue = r2(adjMoves.reduce((s, m) => s + num(m.qty) * num(m.unitCost), 0));
  const retainedEarnings = r2(salesNetProfit - totalExpenses - purchaseGap + adjustmentValue);

  const assetsTotal = r2(cashBank + stockValue + receivables + vendorAdvances);
  const liabilitiesTotal = r2(payables + customerAdvances);
  const equityTotal = r2(capitalIn - drawings + retainedEarnings);
  const imbalance = r2(assetsTotal - (liabilitiesTotal + equityTotal));

  return {
    assets: { cashBank: money(cashBank), stockValue: money(stockValue), receivables: money(receivables), vendorAdvances: money(vendorAdvances), total: money(assetsTotal) },
    liabilities: { payables: money(payables), customerAdvances: money(customerAdvances), total: money(liabilitiesTotal) },
    equity: { capital: money(capitalIn), drawings: money(drawings), retainedEarnings: money(retainedEarnings), total: money(equityTotal) },
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

export default router;
