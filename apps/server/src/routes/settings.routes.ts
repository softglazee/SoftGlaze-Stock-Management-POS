import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { BUSINESS_PRESETS, getPreset } from "../data/business-presets";
import { nextSku } from "../utils/sku";

const router = Router();
router.use(requireAuth);

/** Keys any admin may edit. Integrations (smtp_*, whatsapp_*) arrive in Phase 6. */
const EDITABLE_KEYS = [
  "shop_name",
  "shop_address",
  "shop_phone",
  "currency",
  "currency_symbol",
  "tax_percent",
  "invoice_prefix",
  "invoice_footer",
  "receipt_size",
  "low_stock_sweep_time",
  "debt_reminder_days",
] as const;

/** GET /settings — key/value map (all logged-in users need shop name, currency…) */
router.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.setting.findMany();
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json({ ok: true, data: { settings } });
  } catch (err) {
    next(err);
  }
});

/** PATCH /settings — { key: value, ... } (whitelisted keys) */
router.patch("/", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res, next) => {
  try {
    const body = z.record(z.string()).parse(req.body);
    const entries = Object.entries(body).filter(([key]) => (EDITABLE_KEYS as readonly string[]).includes(key));
    if (entries.length === 0) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "No editable settings in request" } });
    }
    await prisma.$transaction(
      entries.map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }))
    );
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "UPDATE_SETTING", entity: "Setting", details: entries.map(([k]) => k).join(",") },
    });
    res.json({ ok: true, data: { message: "Settings saved" } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "Settings must be text values" } });
    }
    next(err);
  }
});

/** GET /settings/presets — business type choices for onboarding/Settings */
router.get("/presets", async (_req, res, next) => {
  try {
    const presets = BUSINESS_PRESETS.map(({ key, label, description, categories, units }) => ({
      key,
      label,
      description,
      categoryNames: categories.map((c) => c.name),
      unitNames: units.map((u) => u.name),
    }));
    res.json({ ok: true, data: { presets } });
  } catch (err) {
    next(err);
  }
});

const applyPresetSchema = z.object({
  type: z.string().min(1, "Pick a business type"),
  force: z.boolean().optional(),
});

/**
 * POST /settings/apply-preset [SUPER_ADMIN]
 * Seeds categories + units + sample products for the chosen business type.
 * Refuses when real transactions exist (unless force) — presets are starter data,
 * not something to run over a live shop.
 */
router.post("/apply-preset", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const body = applyPresetSchema.parse(req.body);
    const preset = getPreset(body.type);
    if (!preset) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Unknown business type" } });
    }

    const [saleCount, purchaseCount] = await Promise.all([prisma.sale.count(), prisma.purchase.count()]);
    if ((saleCount > 0 || purchaseCount > 0) && !body.force) {
      return res.status(409).json({
        ok: false,
        error: {
          code: "CONFLICT",
          message: "This shop already has sales or purchases. Changing the preset only adds starter data — send force=true to proceed.",
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      let unitsAdded = 0;
      let categoriesAdded = 0;
      let productsAdded = 0;

      // Units — base units first, then converted ones (Ton → kg)
      for (const u of preset.units.filter((x) => !x.base)) {
        const existing = await tx.unit.findUnique({ where: { shortName: u.shortName } });
        if (!existing) {
          await tx.unit.create({ data: { name: u.name, shortName: u.shortName } });
          unitsAdded++;
        }
      }
      for (const u of preset.units.filter((x) => x.base)) {
        const existing = await tx.unit.findUnique({ where: { shortName: u.shortName } });
        if (!existing) {
          const base = await tx.unit.findUnique({ where: { shortName: u.base!.shortName } });
          await tx.unit.create({
            data: { name: u.name, shortName: u.shortName, baseUnitId: base?.id ?? null, factor: u.base!.factor },
          });
          unitsAdded++;
        }
      }

      // Categories — parents, then children
      for (const c of preset.categories) {
        let parent = await tx.category.findUnique({ where: { name: c.name } });
        if (!parent) {
          parent = await tx.category.create({ data: { name: c.name } });
          categoriesAdded++;
        }
        for (const childName of c.children ?? []) {
          const child = await tx.category.findUnique({ where: { name: childName } });
          if (!child) {
            await tx.category.create({ data: { name: childName, parentId: parent.id } });
            categoriesAdded++;
          }
        }
      }

      // Sample products (skipped when a product with the same name exists)
      for (const p of preset.sampleProducts) {
        const exists = await tx.product.findFirst({ where: { name: p.name } });
        if (exists) continue;
        const category = await tx.category.findUnique({ where: { name: p.category } });
        const unit = await tx.unit.findUnique({ where: { shortName: p.unit } });
        if (!category || !unit) continue;
        const sku = await nextSku(tx, category.name);
        await tx.product.create({
          data: {
            sku,
            name: p.name,
            categoryId: category.id,
            unitId: unit.id,
            costPrice: p.costPrice,
            salePrice: p.salePrice,
          },
        });
        productsAdded++;
      }

      await tx.setting.upsert({
        where: { key: "business_type" },
        create: { key: "business_type", value: preset.key },
        update: { value: preset.key },
      });
      await tx.setting.upsert({
        where: { key: "onboarding_done" },
        create: { key: "onboarding_done", value: "1" },
        update: { value: "1" },
      });
      await tx.auditLog.create({
        data: { userId: req.user!.id, action: "APPLY_PRESET", entity: "Setting", details: preset.key },
      });

      return { unitsAdded, categoriesAdded, productsAdded };
    });

    res.json({ ok: true, data: { preset: preset.key, ...result } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    }
    next(err);
  }
});

export default router;
