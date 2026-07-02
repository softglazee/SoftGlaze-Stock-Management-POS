/**
 * Sales / POS (Phase 3) — the transactional heart.
 * A completed sale is ONE prisma.$transaction: Sale + SaleItems (with unitPrice and
 * unitCost snapshots) + SALE StockMovements (combos deduct components at snapshot cost,
 * services skip stock) + Payment(s) + Customer.balance (udhaar) + Counter + AuditLog.
 * Snapshots rule all reports (price-volatility guarantee) — editing product prices later
 * never changes a past sale. Holds (DRAFT) and quotations (QUOTATION) save snapshots only.
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { roleHasPermission } from "../lib/permissions";
import { nextNumber } from "../utils/counter";
import { applyMovement, InsufficientStockError } from "../lib/stock";

const router = Router();
router.use(requireAuth);

const round2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => new Prisma.Decimal(v).toDecimalPlaces(2);

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive("Quantity must be more than 0"),
  unitPrice: z.coerce.number().min(0, "Price cannot be negative"),
  discount: z.coerce.number().min(0).default(0),
});
const paymentSchema = z.object({ methodId: z.string().min(1), amount: z.coerce.number().positive() });
const createSchema = z.object({
  customerId: z.string().nullable().optional(),
  date: z.coerce.date().optional(),
  status: z.enum(["COMPLETED", "DRAFT", "QUOTATION"]).default("COMPLETED"),
  items: z.array(lineSchema).min(1, "Add at least one item"),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  otherCharges: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(1000).nullable().optional(),
  payments: z.array(paymentSchema).optional(),
  overrideCredit: z.boolean().optional(),
});

const productForSale = { comboItems: { include: { componentProduct: { select: { id: true, name: true, type: true, costPrice: true } } } } } satisfies Prisma.ProductInclude;

const saleInclude = {
  customer: { select: { id: true, code: true, name: true, phone: true } },
  user: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, type: true, unit: { select: { shortName: true } } } } } },
  payments: { include: { method: { select: { name: true } } } },
} satisfies Prisma.SaleInclude;

/** Remove cost/profit fields for users without profit visibility. */
function scrubProfit(sale: any, canSeeProfit: boolean) {
  if (canSeeProfit || !sale) return sale;
  const { totalCost, profit, ...rest } = sale;
  rest.items = (sale.items ?? []).map((it: any) => {
    const { unitCost, ...i } = it;
    return i;
  });
  return rest;
}

/** GET /sales?page&limit&search&customerId&status&from&to */
router.get("/", requirePermission("sales.view_all", "sales.view_own"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = String(req.query.search ?? "").trim();
    const customerId = String(req.query.customerId ?? "");
    const status = String(req.query.status ?? "");
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    const canViewAll = await roleHasPermission(req.user!.role, "sales.view_all");
    const canProfit = await roleHasPermission(req.user!.role, "reports.profit");

    const where: Prisma.SaleWhereInput = {};
    if (!canViewAll) where.userId = req.user!.id; // cashier: own sales only
    if (search) where.invoiceNo = { contains: search, mode: "insensitive" };
    if (customerId) where.customerId = customerId;
    if (status) where.status = status as Prisma.SaleWhereInput["status"];
    else where.status = { in: ["COMPLETED", "RETURNED"] };
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [sales, total, sums] = await Promise.all([
      prisma.sale.findMany({ where, include: saleInclude, orderBy: { date: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ _sum: { grandTotal: true, profit: true, dueAmount: true }, where }),
    ]);
    res.json({
      ok: true,
      data: {
        sales: sales.map((s) => scrubProfit(s, canProfit)),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        totalSales: sums._sum.grandTotal ?? 0,
        totalDue: sums._sum.dueAmount ?? 0,
        ...(canProfit ? { totalProfit: sums._sum.profit ?? 0 } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /sales/held — parked (DRAFT) bills for POS resume */
router.get("/held", requirePermission("sales.create"), async (req, res, next) => {
  try {
    const held = await prisma.sale.findMany({ where: { status: "DRAFT" }, include: saleInclude, orderBy: { date: "desc" } });
    res.json({ ok: true, data: { held } });
  } catch (err) {
    next(err);
  }
});

/** GET /sales/quotations — saved quotations */
router.get("/quotations", requirePermission("sales.create"), async (req, res, next) => {
  try {
    const quotations = await prisma.sale.findMany({ where: { status: "QUOTATION" }, include: saleInclude, orderBy: { date: "desc" } });
    res.json({ ok: true, data: { quotations } });
  } catch (err) {
    next(err);
  }
});

/** GET /sales/:id */
router.get("/:id", requirePermission("sales.view_all", "sales.view_own"), async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id }, include: saleInclude });
    if (!sale) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Sale not found" } });
    const canViewAll = await roleHasPermission(req.user!.role, "sales.view_all");
    if (!canViewAll && sale.userId !== req.user!.id) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "You can only view your own sales" } });
    const canProfit = await roleHasPermission(req.user!.role, "reports.profit");
    res.json({ ok: true, data: { sale: scrubProfit(sale, canProfit) } });
  } catch (err) {
    next(err);
  }
});

/** POST /sales — complete a sale, park a hold (DRAFT), or save a quotation. */
router.post("/", requirePermission("sales.create"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);

    // Customer (optional; walk-in when null)
    let customer = null as null | { id: string; name: string; balance: Prisma.Decimal; creditLimit: Prisma.Decimal };
    if (body.customerId) {
      const c = await prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true, name: true, balance: true, creditLimit: true, isActive: true } });
      if (!c) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
      customer = c;
    }

    // Products (+ combo components) and per-line cost snapshot
    const ids = [...new Set(body.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, include: productForSale });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const line of body.items) {
      const p = byId.get(line.productId);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "One of the products was not found" } });
      if (!p.isActive) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: `${p.name} is inactive` } });
    }
    const unitCostOf = (p: (typeof products)[number]) =>
      p.type === "COMBO" ? p.comboItems.reduce((s, ci) => s + Number(ci.qty) * Number(ci.componentProduct.costPrice), 0) : Number(p.costPrice);

    // Money + COGS
    let subTotal = 0;
    let totalCost = 0;
    const computed = body.items.map((l) => {
      const p = byId.get(l.productId)!;
      const total = round2(l.qty * l.unitPrice - l.discount);
      subTotal = round2(subTotal + total);
      const unitCost = round2(unitCostOf(p));
      totalCost = round2(totalCost + l.qty * unitCost);
      return { line: l, product: p, total, unitCost };
    });
    const grandTotal = round2(subTotal - body.discount + body.tax + body.otherCharges);
    if (grandTotal < 0) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Discount is larger than the total" } });
    const profit = round2(grandTotal - totalCost);

    // ── Hold / quotation: snapshots only, no stock/money movement ──
    if (body.status === "DRAFT" || body.status === "QUOTATION") {
      const sale = await prisma.$transaction(async (tx) => {
        const invoiceNo = await nextNumber(tx, body.status === "DRAFT" ? "hold" : "quotation", body.status === "DRAFT" ? "HLD" : "QUO");
        const created = await tx.sale.create({
          data: {
            invoiceNo, customerId: customer?.id ?? null, userId: req.user!.id, status: body.status, ...(body.date ? { date: body.date } : {}),
            subTotal: money(subTotal), discount: money(body.discount), tax: money(body.tax), otherCharges: money(body.otherCharges),
            grandTotal: money(grandTotal), paidAmount: money(0), dueAmount: money(0), totalCost: money(totalCost), profit: money(profit), notes: body.notes || null,
          },
        });
        for (const c of computed) {
          await tx.saleItem.create({ data: { saleId: created.id, productId: c.line.productId, qty: new Prisma.Decimal(c.line.qty), unitPrice: money(c.line.unitPrice), unitCost: money(c.unitCost), discount: money(c.line.discount), taxAmount: money(0), total: money(c.total) } });
        }
        await tx.auditLog.create({ data: { userId: req.user!.id, action: body.status === "DRAFT" ? "HOLD_SALE" : "SAVE_QUOTATION", entity: "Sale", entityId: created.id, details: invoiceNo } });
        return created;
      });
      const full = await prisma.sale.findUnique({ where: { id: sale.id }, include: saleInclude });
      return res.status(201).json({ ok: true, data: { sale: full } });
    }

    // ── Completed sale ──
    if (body.payments && body.payments.length) {
      const methodIds = [...new Set(body.payments.map((p) => p.methodId))];
      const count = await prisma.paymentMethod.count({ where: { id: { in: methodIds } } });
      if (count !== methodIds.length) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Unknown payment method" } });
    }
    const paidAmount = round2((body.payments ?? []).reduce((s, p) => s + p.amount, 0));
    if (paidAmount > grandTotal + 0.01) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Payments exceed the bill total" } });
    const dueAmount = round2(grandTotal - paidAmount);

    if (dueAmount > 0) {
      if (!customer) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Select a customer for credit (udhaar) sales" } });
      const projected = round2(Number(customer.balance) + dueAmount);
      const limit = Number(customer.creditLimit);
      if (limit > 0 && projected > limit + 0.001) {
        if (!body.overrideCredit) {
          return res.status(409).json({ ok: false, error: { code: "CREDIT_LIMIT_EXCEEDED", message: `${customer.name}'s credit limit (₨${limit}) would be exceeded — balance would become ₨${projected}` } });
        }
        const mayOverride = await roleHasPermission(req.user!.role, "sales.discount_over_limit");
        if (!mayOverride) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "You are not allowed to exceed a customer's credit limit" } });
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      const invoiceNo = await nextNumber(tx, "sale", "INV");
      const created = await tx.sale.create({
        data: {
          invoiceNo, customerId: customer?.id ?? null, userId: req.user!.id, status: "COMPLETED", ...(body.date ? { date: body.date } : {}),
          subTotal: money(subTotal), discount: money(body.discount), tax: money(body.tax), otherCharges: money(body.otherCharges),
          grandTotal: money(grandTotal), paidAmount: money(paidAmount), dueAmount: money(dueAmount), totalCost: money(totalCost), profit: money(profit), notes: body.notes || null,
        },
      });
      for (const c of computed) {
        await tx.saleItem.create({ data: { saleId: created.id, productId: c.line.productId, qty: new Prisma.Decimal(c.line.qty), unitPrice: money(c.line.unitPrice), unitCost: money(c.unitCost), discount: money(c.line.discount), taxAmount: money(0), total: money(c.total) } });
        if (c.product.type === "STANDARD") {
          await applyMovement(tx, { productId: c.product.id, type: "SALE", qty: -c.line.qty, unitCost: money(c.unitCost), refType: "SALE", refId: created.id, notes: `Sale ${invoiceNo}`, productName: c.product.name });
        } else if (c.product.type === "COMBO") {
          for (const ci of c.product.comboItems) {
            if (ci.componentProduct.type !== "STANDARD") continue; // only tangible components hold stock
            await applyMovement(tx, { productId: ci.componentProductId, type: "SALE", qty: -(Number(ci.qty) * c.line.qty), unitCost: money(Number(ci.componentProduct.costPrice)), refType: "SALE", refId: created.id, notes: `Sale ${invoiceNo} (combo ${c.product.name})`, productName: ci.componentProduct.name });
          }
        }
        // SERVICE: no stock movement
      }
      if (customer && dueAmount > 0) await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: money(dueAmount) } } });
      for (const p of body.payments ?? []) {
        const refNo = await nextNumber(tx, "payment", "PAY");
        await tx.payment.create({ data: { refNo, type: "SALE_RECEIPT", methodId: p.methodId, amount: money(p.amount), customerId: customer?.id ?? null, saleId: created.id, userId: req.user!.id, notes: `Sale ${invoiceNo}` } });
      }
      await tx.auditLog.create({ data: { userId: req.user!.id, action: "CREATE_SALE", entity: "Sale", entityId: created.id, details: `${invoiceNo} · ₨${grandTotal}${dueAmount > 0 ? ` · udhaar ₨${dueAmount}` : ""}` } });
      return created;
    });

    const full = await prisma.sale.findUnique({ where: { id: sale.id }, include: saleInclude });
    const canProfit = await roleHasPermission(req.user!.role, "reports.profit");
    res.status(201).json({ ok: true, data: { sale: scrubProfit(full, canProfit) } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    if (err instanceof InsufficientStockError) return res.status(409).json({ ok: false, error: { code: err.code, message: err.message } });
    next(err);
  }
});

/** DELETE /sales/:id — discard a held bill or quotation (never a completed sale). */
router.delete("/:id", requirePermission("sales.create"), async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, invoiceNo: true } });
    if (!sale) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Sale not found" } });
    if (sale.status !== "DRAFT" && sale.status !== "QUOTATION") {
      return res.status(400).json({ ok: false, error: { code: "CONFLICT", message: "Completed sales can't be deleted — use a return instead" } });
    }
    await prisma.sale.delete({ where: { id: sale.id } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "DELETE_DRAFT_SALE", entity: "Sale", entityId: sale.id, details: sale.invoiceNo } });
    res.json({ ok: true, data: { message: "Discarded" } });
  } catch (err) {
    next(err);
  }
});

const returnSchema = z.object({
  items: z.array(z.object({ saleItemId: z.string().min(1), qty: z.coerce.number().positive() })).min(1, "Choose items to return"),
  notes: z.string().trim().max(1000).nullable().optional(),
  refundMethodId: z.string().min(1).nullable().optional(),
});

/**
 * POST /sales/:id/return — return items against a completed sale.
 * Reverses at the ORIGINAL snapshot values (price & cost): stock back in, COGS reversed,
 * customer receivable reduced. If a refund method is given, records a REFUND_OUT payment.
 */
router.post("/:id/return", requirePermission("sales.return"), async (req, res, next) => {
  try {
    const body = returnSchema.parse(req.body);
    const original = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: { include: { product: { include: productForSale } } } } });
    if (!original || original.isReturn) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Sale not found" } });
    if (original.status !== "COMPLETED") return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Only completed sales can be returned" } });

    const itemById = new Map(original.items.map((it) => [it.id, it]));
    for (const r of body.items) {
      const it = itemById.get(r.saleItemId);
      if (!it) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Return item is not part of this sale" } });
      if (r.qty > Number(it.qty)) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Cannot return more than was sold" } });
    }

    let returnValue = 0;
    let returnCost = 0;
    for (const r of body.items) {
      const it = itemById.get(r.saleItemId)!;
      returnValue = round2(returnValue + r.qty * Number(it.unitPrice));
      returnCost = round2(returnCost + r.qty * Number(it.unitCost));
    }

    const ret = await prisma.$transaction(async (tx) => {
      const invoiceNo = await nextNumber(tx, "sale_return", "SRET");
      const doc = await tx.sale.create({
        data: {
          invoiceNo, customerId: original.customerId, userId: req.user!.id, status: "RETURNED", isReturn: true, returnOfId: original.id,
          subTotal: money(returnValue), grandTotal: money(returnValue), paidAmount: money(0), dueAmount: money(0), totalCost: money(returnCost), profit: money(round2(returnValue - returnCost)), notes: body.notes || `Return of ${original.invoiceNo}`,
        },
      });
      for (const r of body.items) {
        const it = itemById.get(r.saleItemId)!;
        await tx.saleItem.create({ data: { saleId: doc.id, productId: it.productId, qty: new Prisma.Decimal(r.qty), unitPrice: it.unitPrice, unitCost: it.unitCost, discount: money(0), taxAmount: money(0), total: money(round2(r.qty * Number(it.unitPrice))) } });
        const p = it.product;
        if (p.type === "STANDARD") {
          await applyMovement(tx, { productId: it.productId, type: "SALE_RETURN", qty: r.qty, unitCost: it.unitCost, refType: "SALE_RETURN", refId: doc.id, notes: `Return ${invoiceNo}` });
        } else if (p.type === "COMBO") {
          for (const ci of p.comboItems) {
            if (ci.componentProduct.type !== "STANDARD") continue;
            await applyMovement(tx, { productId: ci.componentProductId, type: "SALE_RETURN", qty: Number(ci.qty) * r.qty, unitCost: money(Number(ci.componentProduct.costPrice)), refType: "SALE_RETURN", refId: doc.id, notes: `Return ${invoiceNo} (combo ${p.name})` });
          }
        }
      }
      // Reduce the customer's receivable by the returned value (may create a credit we owe them)
      if (original.customerId) await tx.customer.update({ where: { id: original.customerId }, data: { balance: { decrement: money(returnValue) } } });
      // Optional cash/bank refund out
      if (body.refundMethodId) {
        const refNo = await nextNumber(tx, "payment", "PAY");
        await tx.payment.create({ data: { refNo, type: "REFUND_OUT", methodId: body.refundMethodId, amount: money(returnValue), customerId: original.customerId, saleId: doc.id, userId: req.user!.id, notes: `Refund for ${invoiceNo}` } });
      }
      await tx.auditLog.create({ data: { userId: req.user!.id, action: "SALE_RETURN", entity: "Sale", entityId: doc.id, details: `${invoiceNo} of ${original.invoiceNo} · ₨${returnValue}` } });
      return doc;
    });

    const full = await prisma.sale.findUnique({ where: { id: ret.id }, include: saleInclude });
    const canProfit = await roleHasPermission(req.user!.role, "reports.profit");
    res.status(201).json({ ok: true, data: { sale: scrubProfit(full, canProfit) } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    if (err instanceof InsufficientStockError) return res.status(409).json({ ok: false, error: { code: err.code, message: err.message } });
    next(err);
  }
});

export default router;
