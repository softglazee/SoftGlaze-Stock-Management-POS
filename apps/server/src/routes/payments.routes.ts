/**
 * Payments (Phase 4): customer receipts (money in against a customer's udhaar) and
 * vendor payments (money out against a vendor payable). Each is ONE transaction:
 * Payment + AccountEntry (via postPayment) + party balance update + AuditLog.
 * POS sale receipts and purchase payments are recorded in their own modules.
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { postPayment } from "../lib/accounts";

const router = Router();
router.use(requireAuth);

const money = (v: number) => new Prisma.Decimal(v).toDecimalPlaces(2);

const paymentInclude = {
  method: { select: { name: true } },
  customer: { select: { id: true, code: true, name: true } },
  vendor: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PaymentInclude;

/** GET /payments?page&limit&type&customerId&vendorId&methodId&from&to&search */
router.get("/", requirePermission("payments.receive", "payments.pay_vendor", "reports.view"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const type = String(req.query.type ?? "");
    const customerId = String(req.query.customerId ?? "");
    const vendorId = String(req.query.vendorId ?? "");
    const methodId = String(req.query.methodId ?? "");
    const search = String(req.query.search ?? "").trim();
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    const where: Prisma.PaymentWhereInput = {};
    if (type) where.type = type as Prisma.PaymentWhereInput["type"];
    if (customerId) where.customerId = customerId;
    if (vendorId) where.vendorId = vendorId;
    if (methodId) where.methodId = methodId;
    if (search) where.refNo = { contains: search, mode: "insensitive" };
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({ where, include: paymentInclude, orderBy: { date: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.payment.count({ where }),
    ]);
    res.json({ ok: true, data: { payments, total, page, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (err) {
    next(err);
  }
});

const receiptSchema = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  methodId: z.string().min(1, "Pick where the money went"),
  amount: z.coerce.number().positive("Amount must be more than 0"),
  date: z.coerce.date().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

/** POST /payments/customer-receipt — receive money from a customer (reduces their balance) */
router.post("/customer-receipt", requirePermission("payments.receive"), async (req, res, next) => {
  try {
    const body = receiptSchema.parse(req.body);
    const customer = await prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true, name: true } });
    if (!customer) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
    const method = await prisma.paymentMethod.findUnique({ where: { id: body.methodId }, select: { id: true } });
    if (!method) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Unknown account" } });

    const payment = await prisma.$transaction(async (tx) => {
      const created = await postPayment(tx, { type: "CUSTOMER_RECEIPT", methodId: body.methodId, amount: body.amount, customerId: customer.id, userId: req.user!.id, notes: body.notes || `Receipt from ${customer.name}`, date: body.date });
      await tx.customer.update({ where: { id: customer.id }, data: { balance: { decrement: money(body.amount) } } });
      await tx.auditLog.create({ data: { userId: req.user!.id, action: "CUSTOMER_RECEIPT", entity: "Payment", entityId: created.id, details: `${created.refNo} · ${customer.name} · ₨${body.amount}` } });
      return created;
    });
    const full = await prisma.payment.findUnique({ where: { id: payment.id }, include: paymentInclude });
    res.status(201).json({ ok: true, data: { payment: full } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    next(err);
  }
});

const vendorPaySchema = z.object({
  vendorId: z.string().min(1, "Pick a vendor"),
  methodId: z.string().min(1, "Pick which account paid"),
  amount: z.coerce.number().positive("Amount must be more than 0"),
  date: z.coerce.date().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

/** POST /payments/vendor-payment — pay a vendor (reduces what we owe them) */
router.post("/vendor-payment", requirePermission("payments.pay_vendor"), async (req, res, next) => {
  try {
    const body = vendorPaySchema.parse(req.body);
    const vendor = await prisma.vendor.findUnique({ where: { id: body.vendorId }, select: { id: true, name: true } });
    if (!vendor) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Vendor not found" } });
    const method = await prisma.paymentMethod.findUnique({ where: { id: body.methodId }, select: { id: true } });
    if (!method) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Unknown account" } });

    const payment = await prisma.$transaction(async (tx) => {
      const created = await postPayment(tx, { type: "VENDOR_PAYMENT", methodId: body.methodId, amount: body.amount, vendorId: vendor.id, userId: req.user!.id, notes: body.notes || `Payment to ${vendor.name}`, date: body.date });
      await tx.vendor.update({ where: { id: vendor.id }, data: { balance: { decrement: money(body.amount) } } });
      await tx.auditLog.create({ data: { userId: req.user!.id, action: "VENDOR_PAYMENT", entity: "Payment", entityId: created.id, details: `${created.refNo} · ${vendor.name} · ₨${body.amount}` } });
      return created;
    });
    const full = await prisma.payment.findUnique({ where: { id: payment.id }, include: paymentInclude });
    res.status(201).json({ ok: true, data: { payment: full } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    next(err);
  }
});

export default router;
