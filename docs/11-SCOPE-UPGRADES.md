# SoftGlaze — Scope Upgrades & Premium Features (docs/11-SCOPE-UPGRADES.md)

This file UPGRADES the main build. Section A items are built DURING the main phases
(they are core scope now, not future ideas). Section B extends docs/10-FUTURE-ROADMAP.md.
All CLAUDE.md rules apply: Decimal money, single transactions, ledger truth, verify before done.

═══════════════════════════════════════════════════════════════
SECTION A — CORE SCOPE UPGRADES (merge into main phases)
═══════════════════════════════════════════════════════════════

## A1. Shop Profile — SUPER_ADMIN edits everything (Phase 1 foundation, full UI Phase 6)

Settings → Shop Profile: every field of the shop, editable live by SUPER_ADMIN:
- Identity: shop name, tagline, logo (drag-drop → A4), business type
- Contact: address line 1/2, city, phone 1, phone 2, WhatsApp number, email, website
- Legal: NTN/tax number, STRN, CNIC (optional)
- Invoice: header extra lines, footer terms (English + optional Urdu line), show/hide
  logo, receipt size default (80mm/A4), invoice prefix
- Regional: currency symbol (₨), date format, timezone, tax % default
Behavior:
- **Live preview panel**: an invoice mock re-renders beside the form as fields change.
- Save writes to `Setting` table; the app reads settings via one cached
  `GET /settings/public` (bust cache on save) — name/logo update instantly in the
  sidebar, login page, and every PDF/receipt/report header without restart.
- Logo pipeline: sharp → webp + small variant for receipts; old logo kept until
  new one is confirmed.

## A2. Dynamic Role Permissions — the Permission Matrix (Phase 6, foundation Phase 1)

Replace fixed role checks with data-driven permissions:
- Schema: `Permission` seed list (~40 keys, grouped) e.g. `products.view/create/edit/delete`,
  `products.import`, `sales.create`, `sales.discount_over_limit`, `sales.return`,
  `sales.view_all` vs `sales.view_own`, `purchases.*`, `customers.*`, `vendors.*`,
  `payments.receive`, `payments.pay_vendor`, `expenses.*`, `employees.*`, `salary.pay`,
  `stock.adjust`, `reports.view`, `reports.profit` (see cost/profit anywhere),
  `reports.export`, `users.manage`, `settings.shop`, `settings.integrations`,
  `audit.view`, `backup.manage`.
- `RolePermission` (role, permissionKey) — defaults seeded to match the docs/04 matrix.
- Server: `requirePermission("key")` middleware (permissions cached in memory,
  invalidated when SUPER_ADMIN saves the matrix). Client fetches the current user's
  permission set at login; UI hides what's not allowed (server still enforces).
- UI: Settings → Roles & Permissions — a matrix grid (roles as columns, grouped
  permission rows, toggle cells), "reset to defaults" per role.
- Hard rules: SUPER_ADMIN implicitly has ALL permissions, is not shown as editable,
  cannot be disabled/deleted/demoted; the system refuses to remove the last SUPER_ADMIN.
- Stretch (optional later): create custom roles ("Store Boy") — schema already allows
  it if Role becomes a table; keep enum for v1, note the migration path.

## A3. Bulk Product Import Wizard — CSV / Excel / XML / TXT / paste (Phase 1)

Route: Products → Import. Four steps:
1. **Source**: drag-drop or browse a file (.csv, .xlsx, .xls, .xml, .txt) OR a big
   "paste raw text" box (tab/comma/semicolon data pasted from anywhere). Auto-detect
   delimiter + encoding + header row; preview first 20 rows in a table.
2. **Map columns**: file columns on the left, SoftGlaze fields on the right —
   name*, sku, barcode, category*, unit*, cost price, sale price*, wholesale price,
   tax %, min stock, opening stock qty, description, image filename/URL.
   Auto-guess mapping from header names ("Item Name"→name, "Rate"→sale price).
   Custom fields box: any unmapped column can be appended into description.
   **Save mapping as a template** (name it) and reuse next time.
3. **Validate**: full dry-run report — rows OK / duplicates (by SKU/barcode) /
   missing category (offer "auto-create categories") / bad numbers / empty required.
   Download the error rows as Excel, fix, re-upload just those.
4. **Import**: progress bar; behavior toggle: *skip existing* or *update existing by
   SKU/barcode*; opening stock creates OPENING StockMovements properly. Summary:
   created / updated / skipped / failed, with an importable error file.
Server: multer upload → papaparse (csv/txt), exceljs (xlsx), fast-xml-parser (xml);
process in chunked transactions (100 rows/tx) so a 5,000-row file can't half-corrupt.
Also build the reverse: **Export products** to Excel/CSV (a perfect round-trip file
that re-imports cleanly). Images by bulk: optional zip upload matched by SKU/filename.

## A4. Drag & Drop Image Uploader — one global component (Phase 1)

`<ImageDropzone>` used for products (multi), categories, employee photos, shop logo:
- Drag-drop multiple files, click-to-browse, paste from clipboard (Ctrl+V a screenshot),
  and mobile camera capture.
- Instant previews with per-file progress bars; drag thumbnails to reorder
  (sortOrder); star icon sets primary image; delete with confirm.
- Client compresses before upload (browser-image-compression, max ~1600px) →
  server sharp: webp main (1200px) + thumbnail (200px); reject >10MB or non-images
  with friendly errors. Alt text auto = product name.

## A5. POS — the definitive specification (Phase 3 builds exactly this)

Full-screen, keyboard-first, fast enough for a queue at the counter.

**Customer (top of right panel):**
- Default: Walk-in Customer.
- Search box: type name OR phone → dropdown of existing customers (with balance badge);
  arrow keys + Enter to select. Recent customers shown on focus.
- **Quick-add inline**: "+ New" opens a 2-field mini form (name, phone) — saves a REAL
  customer (CUS-xxxx) to the Customers module, not a throwaway; full details editable
  later. Selected customer shows name, phone, current balance, credit limit bar.

**Products (left panel):**
- Search by name/SKU/barcode; scanner input auto-adds (Enter suffix).
- Category tiles (with images) → product grid with image, name, price, stock badge.
- **Quick keys**: pinnable favorites grid of best-sellers (cement, sariya sizes) — one
  tap adds; SUPER_ADMIN/Manager arranges them.

**Cart (right panel):** line rows with image, name, qty stepper (F4 edits), unit price
(editable only with `sales.discount_over_limit`-style permission), line discount, line
total; out-of-stock and low-stock warnings inline; Esc voids focused line.

**Totals:** subtotal → bill discount (₨ or %) → tax → delivery/loading charges →
**grand total big in amber** → Paid input → Change due auto OR Due (udhaar) auto with
credit-limit check (block or permission-gated override).

**Payment (F9):** split rows [method ▾][amount], add row; Cash/Bank/JazzCash/EasyPaisa/
Card/Credit; remaining auto-fills last row; F10 completes.

**After completing a sale — the success screen:**
[ Print Receipt 80mm ] [ Print / Download A4 PDF ] [ Send WhatsApp ] [ New Sale (Enter) ]
- Auto-print toggle in settings; Electron does silent printing to the default thermal
  printer, browser mode opens the print dialog. PDF downloads with proper filename
  `INV-000123-CustomerName.pdf`.

**Also:** hold/resume bills tray (F6), returns started by scanning/searching an invoice,
quotation mode toggle, on-screen calculator (F12) that can push results into qty/price,
sticky session (refresh mid-sale restores the cart), every action audit-logged.

## A6. Demo Data Pack — 100+ realistic records per preset (Phase 2–3, after sales exist)

Command: `npm run db:seed:demo -- --preset=building_materials` (works for every preset,
incl. medical_store). Generates, IN THIS ORDER, using the REAL service functions
(never raw inserts — this is what proves P&L correctness):
1. 12–16 categories with placeholder images (generated SVG placeholders: colored tile +
   category initials — zero copyright risk; shop replaces with real photos later).
2. **110+ products** with realistic names for the preset (Lucky Cement 50kg, Sariya 12mm
   Grade-60 / Panadol 500mg strip…), SKUs, barcodes, cost/sale/wholesale prices, units,
   min-stock levels, 1–3 placeholder images each.
3. 40 customers + 15 vendors with Pakistani names, 03xx phone formats, addresses,
   a few with opening balances and credit limits.
4. 8 employees (photos = placeholder avatars, designations, salaries) + **60 days of
   attendance** + 2 months of salary payments (auto-creating their Expenses).
5. **60 days of trading history** through the real transaction services:
   ~25 purchases (mix of paid / pay-later), ~350 sales (cash / credit / split, several
   returns), customer receipts, vendor payments, expenses across all categories.
6. Prints the expected totals at the end (total sales, COGS, expenses, net profit) —
   then the P&L report and `GET /reports/integrity` MUST match all-green. If they
   don't, that's a bug in the money logic — fix the logic, never the test.
Demo rows are tagged (`[DEMO]` note / demo flag) and Settings → Data has a one-click
**"Erase demo data"** (SUPER_ADMIN, double-confirm) that wipes them cleanly before
going live. Seeding is blocked if real (non-demo) transactions already exist.

## A7. Medical Store preset — done properly (Phase 2 stock + preset work)

- Categories: Tablets, Capsules, Syrups, Injections, Drips, Surgical, OTC, Baby Care,
  Cosmetics, Devices. Units with conversions: 1 Pack = 10 Strips = 100 Tablets
  (sell by pack, strip, or tablet — price auto-derives, override allowed).
- **Batch & expiry (the crucial part):** `ProductBatch` model — productId, batchNo,
  expiryDate, qty, unitCost. Purchases enter stock per batch; sales deduct FEFO
  (first-expiry-first-out) with batch shown on the invoice line; stock reports by batch.
- Alerts: near-expiry report + notification (default 90/30 days), expired stock
  quarantine (adjustment type EXPIRED, out of sellable stock, loss report).
- Extras: rack/shelf location field on products, generic-name/salt field + search by
  salt, minimum-margin warning. (Prescription register/narcotics compliance is out of
  v1 scope — note it for later.)
- Batch support is built generically but only activated for presets that need it
  (medical, food) via setting `track_batches`.

═══════════════════════════════════════════════════════════════
SECTION B — MORE PREMIUM FEATURES (extends docs/10-FUTURE-ROADMAP.md)
═══════════════════════════════════════════════════════════════

- **F19. Loyalty points & customer wallet** — earn points per ₨100, redeem at POS;
  returns can credit a store-wallet instead of cash; wallet shows on customer ledger.
- **F20. Discount coupons & gift vouchers** — coded vouchers (fixed/%), validity dates,
  usage limits, POS applies by code; report of redemptions.
- **F21. Auto greetings & campaigns** — Eid/birthday WhatsApp templates to customers;
  simple broadcast to a filtered list (e.g., all contractors), fully logged.
- **F22. Barcode label designer & printing** — design label (name, price, barcode,
  logo), print on roll or A4 sheets, auto-generate barcodes for products without one.
- **F23. Supplier price intelligence** — remembers every vendor's last 5 prices per
  product; at purchase time shows "Vendor B sold you this ₨14/kg cheaper last month."
- **F24. Purchase Orders with approval + auto-send** — draft PO → approve → WhatsApp/
  email PDF to vendor → receive against PO (partial receiving supported).
- **F25. Sales targets & commissions** — monthly shop target with dashboard progress
  ring; per-salesman targets and commission rules (% of sale/product), commission report
  feeding payroll deductions/bonuses.
- **F26. Profit heatmap & hourly patterns** — calendar heatmap of daily profit, hourly
  sales chart (when to add counter staff), weekday comparison.
- **F27. Customer display (second screen)** — POS pushes the live cart + total (and your
  logo/promos) to a customer-facing screen — premium retail feel.
- **F28. Multi-printer routing** — receipt→thermal, challan/A4→laser automatically;
  per-document printer settings in Electron.
- **F29. Global search (Ctrl+K)** — spotlight across invoices, customers, products,
  purchases; jump anywhere in 2 keystrokes.
- **F30. Trash & restore** — soft-deleted master data (products/customers/categories)
  goes to a Trash screen; SUPER_ADMIN restores or purges (financial docs still never delete).
- **F31. Scheduled email reports** — auto monthly P&L + stock valuation PDF to the
  owner's email on the 1st; weekly receivables list to the accountant.
- **F32. Migration kit** — import opening balances, customer/vendor ledgers and stock
  from Excel exports of old software (Tally/others); the wizard from A3 reused with
  ledger-specific mappings — the killer feature for onboarding other shops later.
- **F33. Security pack (server mode)** — two-factor auth (TOTP) for SUPER_ADMIN/ADMIN,
  login alerts, active-sessions screen with remote logout, optional IP allowlist.
- **F34. Shortcut overlay & onboarding tours** — press `?` for a keyboard cheat-sheet;
  first-run guided tour per screen (react-joyride style) so new staff self-learn.

## Where Section A lands in the phases
| Item | Phase |
|---|---|
| A1 Shop profile foundation (settings service, logo) | 1 (UI polish in 6) |
| A2 Permission keys + middleware | 1 · Matrix editor UI | 6 |
| A3 Import wizard + export | 1 |
| A4 Drag-drop uploader | 1 (used everywhere after) |
| A7 Medical preset + batches | 2 |
| A5 Definitive POS | 3 |
| A6 Demo data pack + P&L proof | end of 3 (needs sales services), rerun after 4–5 |

## Prompt lines to give Claude Code
- On next session: "Read docs/11-SCOPE-UPGRADES.md. Section A is core scope — update
  CLAUDE.md's read-order and feature-scope lists and docs/08-CHECKLIST.md to include
  A1–A7 in their phases, commit, then continue the current phase with these upgrades."
- Phase 1 becomes: "...including A1 settings foundation, A2 permission middleware,
  A3 import wizard, A4 drag-drop uploader."
- Phase 3 becomes: "...build POS exactly per docs/11 A5, then generate the A6 demo
  pack and show me the P&L matches and integrity is all-green."
