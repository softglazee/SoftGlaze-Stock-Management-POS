/**
 * Seed: shop-ready defaults for a building materials business.
 * Run: npm run db:seed   (safe to re-run — uses upserts)
 * NOTE: does NOT create a user — the first registration from the app becomes ADMIN.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Units ──
  const units = [
    { name: "Piece", shortName: "pc" },
    { name: "Kilogram", shortName: "kg" },
    { name: "Bag", shortName: "bag" },
    { name: "Foot", shortName: "ft" },
    { name: "Square Foot", shortName: "sqft" },
    { name: "Bundle", shortName: "bdl" },
    { name: "Length", shortName: "len" },
    { name: "Litre", shortName: "ltr" },
  ];
  for (const u of units) {
    await prisma.unit.upsert({ where: { shortName: u.shortName }, create: u, update: {} });
  }
  // Ton = 1000 Kg
  const kg = await prisma.unit.findUnique({ where: { shortName: "kg" } });
  await prisma.unit.upsert({
    where: { shortName: "t" },
    create: { name: "Ton", shortName: "t", baseUnitId: kg!.id, factor: 1000 },
    update: {},
  });

  // ── Categories (typical iron & building materials shop) ──
  const categories = [
    "Cement",
    "Iron Rods (Sariya)",
    "Windows",
    "Doors",
    "Pipes & Fittings",
    "Bricks & Blocks",
    "Sand & Crush",
    "Hardware",
    "Paint",
    "Electrical",
    "Sanitary",
    "Steel Sheets & Girders",
  ];
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, create: { name }, update: {} });
  }
  // Sub-categories example
  const iron = await prisma.category.findUnique({ where: { name: "Iron Rods (Sariya)" } });
  for (const name of ["Sariya 10mm", "Sariya 12mm", "Sariya 16mm", "Sariya 20mm"]) {
    await prisma.category.upsert({ where: { name }, create: { name, parentId: iron!.id }, update: {} });
  }

  // ── Payment methods ──
  const methods = [
    { name: "Cash", isCash: true },
    { name: "Bank Transfer", isCash: false },
    { name: "JazzCash", isCash: false },
    { name: "EasyPaisa", isCash: false },
    { name: "Card", isCash: false },
  ];
  for (const m of methods) {
    await prisma.paymentMethod.upsert({ where: { name: m.name }, create: m, update: {} });
  }

  // ── Expense categories ──
  for (const name of ["Rent", "Salaries", "Electricity", "Transport & Loading", "Tea & Misc", "Repairs", "Miscellaneous"]) {
    await prisma.expenseCategory.upsert({ where: { name }, create: { name }, update: {} });
  }

  // ── Default settings ──
  const settings: Record<string, string> = {
    shop_name: "SoftGlaze Store",
    business_type: "building_materials",
    shop_address: "",
    shop_phone: "",
    currency: "PKR",
    currency_symbol: "₨",
    tax_percent: "0",
    invoice_prefix: "INV",
    invoice_footer: "Thank you for your business! Goods once sold on credit must be settled within agreed time.",
    receipt_size: "80mm",
    // Notifications & reminders
    low_stock_sweep_time: "09:00",
    debt_reminder_days: "30",
    // Integrations (SUPER_ADMIN → Settings → Integrations)
    whatsapp_mode: "walink",            // walink | cloud_api | off
    whatsapp_receipt_template: "*{shop}*\nInvoice {invoice} — Total ₨{total}\nPaid ₨{paid} · Balance ₨{due}\nThank you for your business!",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
    smtp_from_name: "SoftGlaze Store",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  console.log("✅ Seed complete: units, categories, payment methods, expense categories, settings.");
  console.log("👉 Now open the app and create your admin account on the Register page.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
