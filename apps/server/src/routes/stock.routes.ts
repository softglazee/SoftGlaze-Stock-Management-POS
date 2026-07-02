import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { nextNumber } from "../utils/counter";
import { applyMovement, InsufficientStockError } from "../lib/stock";

const router = Router();
router.use(requireAuth);

/** GET /stock/movements?productId&from&to&type&page&limit — the stock ledger */
router.get("/movements", requirePermission("products.view"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const productId = String(req.query.productId ?? "");
    const type = String(req.query.type ?? "");
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    const where: Prisma.StockMovementWhereInput = {};
    if (productId) where.productId = productId;
    if (type) where.type = type as Prisma.StockMovementWhereInput["type"];
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: { product: { select: { id: true, name: true, sku: true, unit: { select: { shortName: true } } } } },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    res.json({ ok: true, data: { movements, total, page, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (err) {
    next(err);
  }
});

const adjustSchema = z.object({
  reason: z.string().trim().min(1, "Give a reason").max(120),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qtyChange: z.coerce.number().refine((n) => n !== 0, "Change cannot be zero"),
        unitCost: z.coerce.number().min(0).nullable().optional(),
        damage: z.boolean().optional(), // treat an outward change as DAMAGE instead of ADJUSTMENT_OUT
      })
    )
    .min(1, "Add at least one product"),
});

/** GET /stock/adjustments — history */
router.get("/adjustments", requirePermission("stock.adjust"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [adjustments, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        include: { user: { select: { name: true } }, items: { include: { product: { select: { name: true, sku: true, unit: { select: { shortName: true } } } } } } },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockAdjustment.count(),
    ]);
    res.json({ ok: true, data: { adjustments, total, page, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /stock/adjustments — correct stock (damage, count fix, theft, expiry).
 * One transaction: StockAdjustment + items + StockMovements + stockQty updates.
 */
router.post("/adjustments", requirePermission("stock.adjust"), async (req, res, next) => {
  try {
    const body = adjustSchema.parse(req.body);
    const ids = [...new Set(body.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, type: true, costPrice: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const it of body.items) {
      const p = byId.get(it.productId);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "One of the products was not found" } });
      if (p.type !== "STANDARD") return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: `${p.name} does not track stock` } });
    }

    const adjustment = await prisma.$transaction(async (tx) => {
      const refNo = await nextNumber(tx, "adjustment", "ADJ");
      const adj = await tx.stockAdjustment.create({ data: { refNo, reason: body.reason, userId: req.user!.id } });
      for (const it of body.items) {
        const p = byId.get(it.productId)!;
        await tx.stockAdjustmentItem.create({ data: { adjustmentId: adj.id, productId: it.productId, qtyChange: new Prisma.Decimal(it.qtyChange) } });
        const type = it.qtyChange > 0 ? "ADJUSTMENT_IN" : it.damage ? "DAMAGE" : "ADJUSTMENT_OUT";
        await applyMovement(tx, {
          productId: it.productId,
          type,
          qty: it.qtyChange,
          unitCost: it.unitCost ?? p.costPrice,
          refType: "ADJUSTMENT",
          refId: adj.id,
          notes: `${refNo}: ${body.reason}`,
          productName: p.name,
        });
      }
      await tx.auditLog.create({ data: { userId: req.user!.id, action: "STOCK_ADJUSTMENT", entity: "StockAdjustment", entityId: adj.id, details: `${refNo}: ${body.reason}` } });
      return adj;
    });

    const full = await prisma.stockAdjustment.findUnique({
      where: { id: adjustment.id },
      include: { user: { select: { name: true } }, items: { include: { product: { select: { name: true, sku: true, unit: { select: { shortName: true } } } } } } },
    });
    res.status(201).json({ ok: true, data: { adjustment: full } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    if (err instanceof InsufficientStockError) return res.status(409).json({ ok: false, error: { code: err.code, message: err.message } });
    next(err);
  }
});

/**
 * POST /stock/recalculate [ADMIN] — rebuild cached Product.stockQty from the ledger.
 * Integrity safety net; returns products whose cache was corrected.
 */
router.post("/recalculate", requireRole("SUPER_ADMIN", "ADMIN"), async (_req, res, next) => {
  try {
    const sums = await prisma.stockMovement.groupBy({ by: ["productId"], _sum: { qty: true } });
    const sumById = new Map(sums.map((s) => [s.productId, s._sum.qty ?? new Prisma.Decimal(0)]));
    const products = await prisma.product.findMany({ select: { id: true, name: true, stockQty: true } });
    const fixes: { id: string; name: string; was: string; now: string }[] = [];
    for (const p of products) {
      const ledger = sumById.get(p.id) ?? new Prisma.Decimal(0);
      if (!new Prisma.Decimal(p.stockQty).equals(ledger)) {
        await prisma.product.update({ where: { id: p.id }, data: { stockQty: ledger } });
        fixes.push({ id: p.id, name: p.name, was: p.stockQty.toString(), now: ledger.toString() });
      }
    }
    res.json({ ok: true, data: { checked: products.length, corrected: fixes.length, fixes } });
  } catch (err) {
    next(err);
  }
});

export default router;
