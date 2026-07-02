import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { imageUpload, saveImage, deleteImageFiles } from "../lib/upload";
import { nextSku } from "../utils/sku";

const router = Router();
router.use(requireAuth);

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER"] as const;

const money = z.coerce.number().min(0, "Cannot be negative");
const qty = z.coerce.number().min(0, "Cannot be negative");

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  sku: z.string().trim().max(30).optional(), // omitted → auto CEM-0001
  barcode: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  categoryId: z.string().min(1, "Category is required"),
  unitId: z.string().min(1, "Unit is required"),
  costPrice: money.default(0),
  salePrice: money.default(0),
  wholesalePrice: money.nullable().optional(),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  minStockLevel: qty.default(0),
  openingStock: qty.default(0), // creates an OPENING stock movement
});

const updateSchema = createSchema.omit({ openingStock: true }).partial().extend({
  isActive: z.boolean().optional(),
});

const productInclude = {
  category: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, shortName: true } },
  images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
} satisfies Prisma.ProductInclude;

/** GET /products?page&limit&search&categoryId&status=active|inactive|low|out */
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = String(req.query.search ?? "").trim();
    const categoryId = String(req.query.categoryId ?? "");
    const status = String(req.query.status ?? "");

    const where: Prisma.ProductWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;
    if (status === "out") where.stockQty = { lte: 0 };
    if (status === "low") {
      where.isActive = true;
      where.minStockLevel = { gt: 0 };
      // stockQty <= minStockLevel — column comparison needs raw filter below
    }

    let products;
    let total;
    if (status === "low") {
      // Prisma cannot compare two columns in a plain where — fetch ids via raw SQL
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "isActive" = true AND "minStockLevel" > 0 AND "stockQty" <= "minStockLevel"`;
      const ids = rows.map((r) => r.id);
      where.id = { in: ids };
      delete where.minStockLevel;
      [products, total] = await Promise.all([
        prisma.product.findMany({ where, include: productInclude, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
        prisma.product.count({ where }),
      ]);
    } else {
      [products, total] = await Promise.all([
        prisma.product.findMany({ where, include: productInclude, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
        prisma.product.count({ where }),
      ]);
    }

    res.json({ ok: true, data: { products, total, page, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (err) {
    next(err);
  }
});

/** GET /products/low-stock — active products at/below their minimum */
router.get("/low-stock", async (_req, res, next) => {
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Product"
      WHERE "isActive" = true AND "minStockLevel" > 0 AND "stockQty" <= "minStockLevel"`;
    const products = await prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: productInclude,
      orderBy: { name: "asc" },
    });
    res.json({ ok: true, data: { products } });
  } catch (err) {
    next(err);
  }
});

/** GET /products/search?q= — fast POS search (name / SKU / barcode) */
router.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ ok: true, data: { products: [] } });
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: q },
        ],
      },
      include: productInclude,
      take: 20,
      orderBy: { name: "asc" },
    });
    res.json({ ok: true, data: { products } });
  } catch (err) {
    next(err);
  }
});

/** GET /products/:id */
router.get("/:id", async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: productInclude });
    if (!product) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    res.json({ ok: true, data: { product } });
  } catch (err) {
    next(err);
  }
});

/** POST /products — create (+ optional opening stock, atomically via the ledger) */
router.post("/", requireRole(...WRITE_ROLES), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Category not found" } });
    }
    const unit = await prisma.unit.findUnique({ where: { id: body.unitId } });
    if (!unit) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Unit not found" } });
    }

    const product = await prisma.$transaction(async (tx) => {
      const sku = body.sku || (await nextSku(tx, category.name));
      const created = await tx.product.create({
        data: {
          sku,
          name: body.name,
          barcode: body.barcode || null,
          description: body.description || null,
          categoryId: body.categoryId,
          unitId: body.unitId,
          costPrice: body.costPrice,
          salePrice: body.salePrice,
          wholesalePrice: body.wholesalePrice ?? null,
          taxPercent: body.taxPercent,
          minStockLevel: body.minStockLevel,
          stockQty: body.openingStock,
        },
      });
      if (body.openingStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            type: "OPENING",
            qty: body.openingStock,
            unitCost: body.costPrice,
            refType: "OPENING",
            balance: body.openingStock,
            notes: "Opening stock at product creation",
          },
        });
      }
      await tx.auditLog.create({
        data: { userId: req.user!.id, action: "CREATE_PRODUCT", entity: "Product", entityId: created.id, details: `${sku} ${created.name}` },
      });
      return created;
    });

    const withRelations = await prisma.product.findUnique({ where: { id: product.id }, include: productInclude });
    res.status(201).json({ ok: true, data: { product: withRelations } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ ok: false, error: { code: "DUPLICATE", message: "A product with this SKU or barcode already exists" } });
    }
    next(err);
  }
});

/** PATCH /products/:id — stockQty is NEVER editable here (ledger owns it) */
router.patch("/:id", requireRole(...WRITE_ROLES), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    if (body.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!category) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Category not found" } });
      }
    }
    if (body.unitId) {
      const unit = await prisma.unit.findUnique({ where: { id: body.unitId } });
      if (!unit) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Unit not found" } });
      }
    }
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        sku: body.sku,
        barcode: body.barcode === undefined ? undefined : body.barcode || null,
        description: body.description === undefined ? undefined : body.description || null,
        categoryId: body.categoryId,
        unitId: body.unitId,
        costPrice: body.costPrice,
        salePrice: body.salePrice,
        wholesalePrice: body.wholesalePrice === undefined ? undefined : body.wholesalePrice,
        taxPercent: body.taxPercent,
        minStockLevel: body.minStockLevel,
        isActive: body.isActive,
      },
      include: productInclude,
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "UPDATE_PRODUCT", entity: "Product", entityId: product.id, details: `${product.sku} ${product.name}` },
    });
    res.json({ ok: true, data: { product } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ ok: false, error: { code: "DUPLICATE", message: "A product with this SKU or barcode already exists" } });
    }
    next(err);
  }
});

/** DELETE /products/:id — soft-deactivate when referenced, else hard delete */
router.delete("/:id", requireRole(...WRITE_ROLES), async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        images: true,
        _count: { select: { saleItems: true, purchaseItems: true, stockMoves: true, adjustmentItems: true } },
      },
    });
    if (!product) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const referenced =
      product._count.saleItems > 0 ||
      product._count.purchaseItems > 0 ||
      product._count.stockMoves > 0 ||
      product._count.adjustmentItems > 0;

    if (referenced) {
      await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
      await prisma.auditLog.create({
        data: { userId: req.user!.id, action: "DEACTIVATE_PRODUCT", entity: "Product", entityId: product.id, details: product.name },
      });
      return res.json({
        ok: true,
        data: { message: `${product.name} has history, so it was deactivated (kept for old invoices)`, deactivated: true },
      });
    }

    await prisma.product.delete({ where: { id: product.id } });
    for (const img of product.images) await deleteImageFiles(img.path, img.thumbPath);
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "DELETE_PRODUCT", entity: "Product", entityId: product.id, details: product.name },
    });
    res.json({ ok: true, data: { message: `${product.name} deleted`, deactivated: false } });
  } catch (err) {
    next(err);
  }
});

/** POST /products/:id/images — multipart, up to 5 files, field "images" */
router.post("/:id/images", requireRole(...WRITE_ROLES), imageUpload.array("images", 5), async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { images: true } } },
    });
    if (!product) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found" } });
    }
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "No image files received" } });
    }
    let hasPrimary = product._count.images > 0
      ? (await prisma.productImage.count({ where: { productId: product.id, isPrimary: true } })) > 0
      : false;
    const images = [];
    for (const [index, file] of files.entries()) {
      const saved = await saveImage(file.buffer, "products");
      const image = await prisma.productImage.create({
        data: {
          productId: product.id,
          path: saved.path,
          thumbPath: saved.thumbPath,
          isPrimary: !hasPrimary && index === 0,
          sortOrder: product._count.images + index,
        },
      });
      if (image.isPrimary) hasPrimary = true;
      images.push(image);
    }
    res.status(201).json({ ok: true, data: { images } });
  } catch (err) {
    next(err);
  }
});

/** PATCH /products/:id/images/:imageId/primary */
router.patch("/:id/images/:imageId/primary", requireRole(...WRITE_ROLES), async (req, res, next) => {
  try {
    const image = await prisma.productImage.findFirst({ where: { id: req.params.imageId, productId: req.params.id } });
    if (!image) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Image not found" } });
    }
    await prisma.$transaction([
      prisma.productImage.updateMany({ where: { productId: image.productId }, data: { isPrimary: false } }),
      prisma.productImage.update({ where: { id: image.id }, data: { isPrimary: true } }),
    ]);
    res.json({ ok: true, data: { message: "Primary image updated" } });
  } catch (err) {
    next(err);
  }
});

/** DELETE /products/:id/images/:imageId */
router.delete("/:id/images/:imageId", requireRole(...WRITE_ROLES), async (req, res, next) => {
  try {
    const image = await prisma.productImage.findFirst({ where: { id: req.params.imageId, productId: req.params.id } });
    if (!image) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Image not found" } });
    }
    await prisma.productImage.delete({ where: { id: image.id } });
    await deleteImageFiles(image.path, image.thumbPath);
    if (image.isPrimary) {
      const nextImage = await prisma.productImage.findFirst({
        where: { productId: image.productId },
        orderBy: { sortOrder: "asc" },
      });
      if (nextImage) await prisma.productImage.update({ where: { id: nextImage.id }, data: { isPrimary: true } });
    }
    res.json({ ok: true, data: { message: "Image deleted" } });
  } catch (err) {
    next(err);
  }
});

export default router;
