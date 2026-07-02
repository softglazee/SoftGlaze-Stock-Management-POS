# SESSION-NOTES.md

> Living hand-off file. Updated after every module or mid-task stop.
> Read this at the start of every session (see CLAUDE.md → Grounding & session continuity rules).

## Current status (2026-07-02) — Phase 1 UPGRADES COMPLETE ✅ (A1–A4, G2, G3, G7, G10)

**What was just done (Phase 1 upgrade items, all verified):**
- **Schema migration** `phase1_upgrades_brands_types_permissions`: `Brand`, `ProductType` enum
  (STANDARD/SERVICE/COMBO), `ComboItem`, `Permission`, `RolePermission`; `Product` gained
  `type`, `brandId`, and dimensions (`length/width/height/weight`). Prisma client regenerated.
- **A2 permissions:** `apps/server/src/data/permissions.ts` (40-key catalog + role defaults +
  `seedPermissions`), `lib/permissions.ts` (in-memory cache, `getPermissionsForRole`,
  `roleHasPermission`, `invalidatePermissionCache`), `middleware/permission.ts`
  (`requirePermission(...keys)` — ANY-of), `routes/permissions.routes.ts`
  (`GET /`, `GET /me`, `GET/PUT /matrix`, `POST /reset`). Auth responses now include
  `permissions`. Seeded: 40 permissions, 93 role-perm rows (ADMIN 38 / MANAGER 33 /
  CASHIER 7 / ACCOUNTANT 15). Web: AuthContext stores `permissions` + `can()`.
- **A1 shop profile:** settings.routes expanded `EDITABLE_KEYS`; public `GET /settings/public`
  (before auth); `POST/DELETE /settings/logo` (sharp webp + thumb) and `POST /settings/favicon`
  (64px png) via `lib/upload.ts saveFavicon`. Web: `Branding.tsx` (tab title + favicon),
  shop name/logo on Login + sidebar/top-bar. PATCH/logo guarded by `requirePermission("settings.shop")`.
- **G2 brands:** `routes/brands.routes.ts` (CRUD + `/:id/image`, delete-protection),
  `pages/Brands.tsx`, nav link, product brand filter + brand `<select>`.
- **G3 + G10 products:** products.routes create/update accept `type/brandId/dimensions/comboItems`;
  SERVICE + COMBO skip stock; combo validation (no dupes, no self, no combo-in-combo); combo
  membership replaced atomically. Product modal: type selector, brand select, combo builder,
  collapsible dimensions.
- **A3 + G7 import/export:** `lib/tabular.ts` (papaparse CSV/TXT/paste, exceljs XLSX,
  fast-xml-parser XML + auto delimiter/mapping), `routes/import.routes.ts`
  (`/fields/:entity`, `/parse`, `/:entity/validate` dry-run, `/:entity/commit` chunked 100/tx
  with per-row salvage, `GET /products/export?format=csv|xlsx`). Web: `components/ImportWizard.tsx`
  (4-step, saved mapping templates in localStorage) wired into Products/Customers/Vendors;
  Export button on Products.
- **A4 ImageDropzone:** `components/ImageDropzone.tsx` (drag/click/clipboard-paste + reorder +
  primary star + `browser-image-compression`) used in Products, Categories, Brands.
- New packages: server `papaparse`, `fast-xml-parser`, `@types/papaparse`; web `browser-image-compression`.

**Verified (rule-2):**
- `npx tsc --noEmit` (server) and `tsc -b` (web) both clean.
- Endpoints exercised with a signed dev JWT: `settings/public`; `permissions/me`
  (SUPER_ADMIN=40, CASHIER=7); brand create; product STANDARD (auto SKU, stock 10, brand, dims)
  / SERVICE (opening stock ignored → 0) / COMBO (component qty snapshot, stock 0);
  **CASHIER POST /brands → 403** (permission enforcement); **combo-in-combo → 400**;
  product import parse→validate (create 2, 1 error row flagged)→commit (created 2, auto-created a
  new category + brand)→export CSV (correct round-trip headers).
- Browser (Playwright, dev token injected): `/login`, `/brands`, `/products` load with **0 app
  console errors**; Add-product modal switched to COMBO renders combo builder + dimensions +
  ImageDropzone with 0 errors; tab title shows shop name; Brands nav + Import + Export present.
- All `ZZ`-prefixed test data cleaned from the DB (0 remaining); test counters `sku:BRI`/`sku:ZZN` removed.

**Exact next step:** Owner to confirm these upgrades, then **Phase 2** per KICKOFF-PROMPT.md
(Purchases + udhaar, stock ledger, weighted-avg cost, adjustments, purchase returns, low-stock)
plus A7 (medical preset + `ProductBatch` FEFO) and **G3 combo stock logic** (selling a combo
deducts component stock at snapshot costs — the ComboItem model is ready).

**Known issues / notes:**
- Matrix editor UI and full Shop Profile form are deliberately deferred to Phase 6 (APIs exist now).
- Saved-image reorder in ImageDropzone is client-side for pending files only; reordering already-saved
  product images needs a future sortOrder endpoint (primary-star + delete work today).
- favicon.ico root 404 stays until the owner uploads a favicon (endpoint ready).
- DB still must be started manually after reboot (`scripts\start-db.ps1`); Prisma `generate` needs the
  API dev server stopped first on Windows (EPERM file lock) — stop port 4000's node, then generate.

---

## Prior status (2026-07-02) — Phase 1 COMPLETE ✅ (Phase 0 done earlier today)

**What was just done (Phase 1, all verified):**
- Server routes (all `requireAuth` + `requireRole`, zod-validated, standard `{ok,data|error}` shape):
  `units`, `categories` (tree + cycle guard + image upload), `settings` (+ `GET /settings/presets`,
  `POST /settings/apply-preset` SUPER_ADMIN-only, refuses when sales/purchases exist unless force),
  `products` (auto SKU per category prefix via Counter `sku:<PREFIX>`, opening stock creates an
  OPENING StockMovement in the same transaction, low-stock/out filters, POS `/products/search`,
  multi-image upload → sharp → webp 1200px + 300px thumb, primary image, soft-deactivate when referenced),
  `customers` + `vendors` (Counter codes CUS-/VEN-, balance starts at openingBalance, opening-balance
  edits shift live balance by delta, DELETE refuses when balance ≠ 0, deactivates when history exists).
- Data: `apps/server/src/data/business-presets.ts` (7 presets per docs/09 §1).
- Web: shared UI kit `components/ui.tsx` (ToastProvider, Modal, ConfirmDialog, EmptyState, PageHeader,
  SearchBox, Badge, TableSkeleton, Pagination), `lib/format.ts` (Decimal-string → money/qty),
  `lib/types.ts`. Pages: Onboarding (business type picker), Units, Categories, Products, Customers,
  Vendors. Layout: Units nav link, onboarding redirect (settings.onboarding_done), mobile drawer
  sidebar + top bar, tables scroll sideways on phones.

**Verified (rule-2):**
- `npx tsc --noEmit` clean in both apps.
- Endpoints exercised with curl (create/edit/delete/duplicate/409 paths). Test rows cleaned from DB after.
- Browser (Playwright): onboarding applied Building Materials preset for the owner (onboarding_done=1,
  3 sample products with SKUs CEM-0001/SAR-0001/WIN-0001); Units page shows 1 t = 1,000 kg; Products
  list + filters + money mono columns; image upload pipeline serves webp + thumb (thumbnail visible in
  list); Customers add-modal → CUS-0001 with red ₨5,000 balance + live receivable total; delete blocked
  with non-zero balance (409, by design); dark + light themes at 1440px and 375px.
- Owner registered account "Azhar Ali" (SUPER_ADMIN) and was browsing the app live during the session.

**Unverified / known issues:**
- favicon.ico still 404 (cosmetic).
- Category image upload tested at API level; not yet exercised through the modal UI.
- One deliberate leftover: sample product "Lucky Cement 50kg (sample)" carries an orange test photo
  (demonstrates thumbnails; sample products are meant to be deleted by the owner anyway).
- DB does not auto-start on reboot → `scripts\start-db.ps1` first (portable Postgres, no admin rights).

**Scope change discovered mid-session:** the owner added `docs/10-FUTURE-ROADMAP.md`,
`docs/11-SCOPE-UPGRADES.md` and `docs/12-GAP-CLOSURE.md` to the repo while Phase 1 was being
built. Per docs/11's own instructions, CLAUDE.md (read order + feature scope) and
docs/08-CHECKLIST.md were updated to merge A1–A7 and G1–G10 into their phases. The
price-volatility guarantee (docs/12 top) is now a recorded hard requirement.

**Exact next step:** Owner to confirm. Remaining *Phase 1 upgrade* items (new, unchecked in
checklist): A1 settings foundation, A2 permission middleware, A3 bulk product import wizard +
export, A4 ImageDropzone, G2 brands, G3 product types (STANDARD/SERVICE/COMBO), G7
customer/vendor import, G10 dimensions + favicon. Build those before Phase 2, then Phase 2
per KICKOFF-PROMPT.md + A7 (medical preset, batches) + G3 combo stock.
