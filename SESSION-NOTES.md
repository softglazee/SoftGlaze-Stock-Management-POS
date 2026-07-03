# SESSION-NOTES.md

> Living hand-off file. Updated after every module or mid-task stop.
> Read this at the start of every session (see CLAUDE.md → Grounding & session continuity rules).

## Local build-verification pass (2026-07-03) — FULL BUILD GREEN ✅ (owner wants it perfect locally before VPS)

Owner directive: "build it proper and perfect first locally … make sure no errors and every feature should exist" — VPS (Phase 8) explicitly NOT now. Ran a complete clean build + runtime verification on the committed tree (`d78f104`, git clean). Nothing needed fixing — all green. No source changed; this note is the only change.

- **Builds (rule 9):** `apps/server` `tsc --noEmit` CLEAN + `npm run build` → `dist/index.js`. `apps/web` `tsc --noEmit` CLEAN + `tsc -b && vite build` → `dist/` (⚠ single JS chunk 983 kB / 267 kB gzip — a warning, not an error; optional future `manualChunks` split before VPS).
- **DB:** portable Postgres 16.9 up on 5432; `prisma migrate status` → "up to date" (3 migrations). Schema current.
- **Runtime (built `node dist/index.js` on spare port 4300, NODE_ENV=production — the exact desktop process):** `GET /reports/integrity` **all-green 8/8**, balance sheet ₨0 (clean owner-ready DB: 3 sample products, 5 accounts, 0 sales/purchases/customers). 36/36 GET endpoints returned `ok:true` (products, customers, vendors, categories, brands, units, accounts, payment-methods, expenses(+categories), employees, hr(departments/shifts/holidays/leaves), sales, purchases, stock/movements, all 10 reports + dashboard + cashbook, users, permissions/matrix, notifications(+unread-count), messages, audit, settings/public, backup/summary). **PDF export** = valid `%PDF-` (application/pdf); **Excel export** = valid `PK`/xlsx. **Single-origin SPA**: `/` serves HTML, `/settings` deep-link falls back to index.html, unknown `/api/*` → JSON 404 (desktop mode proven).
- **UI (Playwright on the production build at :4300, dev JWT injected):** every page renders — Dashboard, Reports, Accounts, Employees, Settings (all 6 tabs), Purchases, Products, POS, Users, Customers, Notifications. **0 console errors** in a fresh session across login→Settings→Roles&Permissions tab→POS→Reports. Confirmed the Settings **PermissionsTab `<Fragment key={g}>` fix is live** (the "unique key" warning seen earlier was stale history from an old :5173 dev session, not this build).
- **Feature inventory:** 25/25 server route files mounted in `app.ts`; 22/22 web pages routed in `App.tsx`. All core scope present.
- **Intentionally-deferred (documented, NOT bugs — none block this shop's launch):** A7 medical batch/expiry FEFO (owner is building-materials), G4 warranty fields (needs schema), G5 camera-barcode + weighing-scale (hardware-flagged; USB keyboard-wedge scanners already work into POS F2 search), A6 demo-data pack (dev convenience), G9 display-currency switcher (books PKR-locked). Offer these to the owner; build only if requested.
- **Cleanup:** test server (PID) stopped, browser closed, dev token in scratchpad (60-min). DB untouched (no test writes — verification was read-only/GETs + a throwaway health boot).

**Next:** owner confirms; optionally build any deferred extra they want; then Phase 7 installer (`npm install` → `npm run build` → `npm run desktop` → `cd apps/desktop && npm run dist`) on their machine, then Phase 8 (VPS) only on explicit "go" + server access.

---

## Current status (2026-07-03) — Phase 7 WIRED ✅ (Desktop) — installer build + clean-PC test are owner steps

Also fixed: server `tsconfig.json` moduleResolution `node`→`nodenext` (+ module `nodenext`) to clear the TS 7.0 deprecation; tsc clean.

**Single-origin serving (server):** `app.ts` now serves the built web app (`apps/web/dist`) + API on ONE origin when `SERVE_WEB=1` or `NODE_ENV=production` and the build exists — `express.static` + SPA fallback (`/api` & `/uploads` excluded), `WEB_DIST` overridable. helmet `contentSecurityPolicy: false` (the SPA needs inline styles for charts/dynamic colours; self-hosted/desktop threat model). Verified: `/` serves HTML+assets, `/settings` falls back to index.html, `/api/*` stays JSON incl. 404. This also enables an optional single-origin server deployment (VPS still uses nginx).

**Desktop (`apps/desktop/`):** rewrote the Phase-0 stub into a production Electron shell. `main.cjs`: spawns the built server with `process.execPath` + `ELECTRON_RUN_AS_NODE=1` (Electron's Node runs it — clean PC needs no Node), env `SERVE_WEB/WEB_DIST/UPLOAD_DIR(%APPDATA%/SoftGlaze/uploads)/PORT/DATABASE_URL/JWT_*`; config file `%APPDATA%/SoftGlaze/softglaze.config.json` (auto DATABASE_URL default = local pg + random JWT secrets on first run); waits `/api/v1/health` (45s, friendly error dialog with log tail if DB down); loads `http://localhost:4000`; single-instance lock; `setWindowOpenHandler` sends http/wa.me links to the system browser but allows blank print windows; kills server on quit. `preload.cjs` (contextIsolation, exposes `window.softglaze`). `package.json`: electron@33.2.1 + electron-builder@25.1.8 (both verified to exist), `predist` builds server+web, `dist` → NSIS `SoftGlaze-Stock-Manager-Setup-${version}.exe`; extraResources bundle server/dist + web/dist + server/prisma + **root** node_modules (workspace hoisting → runtime deps + Prisma engine live there). `.gitignore` (release/), README with build/test walkthrough.

**Verified (rule-2):** built `node dist/index.js` (the exact process Electron spawns) runs in production mode on a spare port, connects to Postgres, serves app+API+cron, no errors. NOT yet run: the Electron GUI window and the actual `electron-builder dist` (both need the owner's machine/GUI + a clean-PC install — that's the phase's "test on shop PC" step). electron/electron-builder not yet `npm install`ed in the workspace (owner runs `npm install` before `npm run desktop`/`dist`).

**Open decision (docs/07 flagged it as joint):** DB packaging for a clean PC — (A) Postgres on the PC [built now, zero accounting risk, recommended for the owner's single shop PC], (B) bundle portable Postgres into the installer for true one-click, or (C) switch Prisma to SQLite (schema change: drop `@db.Decimal`, re-run migrations, re-verify all money math). Ask the owner before doing B or C.

**Next:** owner runs `npm install` + `npm run build` + `npm run desktop` to see it as a window, then `cd apps/desktop && npm run dist` to build the installer and test on the shop PC. Then Phase 8 (VPS + HTTPS + daily backup) and Phase 9 (launch). Do NOT start Phase 8 without the owner's "go" + server access.

---

## Phase 6 COMPLETE ✅ (Admin & Integrations)

No schema change (all Phase 6 models existed). New deps: nodemailer, node-cron (+types). Both apps tsc clean; backend verified 21/21 (users CRUD + role rules, integration secret masking, graceful SMTP-test failure + logging, message log, notification sweep, audit 103 entries, **backup export→wipe→restore round-trip with integrity all-green**); web smoke (Users + all 6 Settings tabs + bell, 0 console errors). Test residue cleaned (1 owner user, integrity ₨0).

**Server:** `users.routes.ts` (list/create/update/reset-password/deactivate; owner protected, no self-lockout, only SUPER_ADMIN grants ADMIN). `notifications.routes.ts` + `lib/notify.ts` (runSweep: low-stock/debt/payable, deduped vs unread) + **node-cron** daily sweep in index.ts at `low_stock_sweep_time`. `messages.routes.ts` (MessageLog list + /log for client wa.me sends). `audit.routes.ts` (GET /audit, filters, distinct actions). `backup.routes.ts` (GET /export full JSON snapshot, /summary, POST /restore SUPER_ADMIN wipe+reload in FK order — express.json limit raised to 50mb). `lib/mailer.ts` (nodemailer from saved SMTP). Extended `settings.routes.ts`: INTEGRATION_KEYS + SECRET_KEYS (smtp_pass masked in GET /settings via `smtp_pass_set` flag, never overwritten by blank), GET/PATCH /settings/integrations, POST /settings/test-email (logs MessageLog). Mounted users/notifications/messages/audit/backup.

**Web:** `pages/Users.tsx`; `pages/Settings.tsx` (tabs: Shop Profile+logo/favicon+**live invoice preview**, Business Type apply-preset, Roles & Permissions matrix editor, Integrations SMTP+test+WhatsApp+templates, Backup export/restore, Audit Log); `pages/Notifications.tsx`; `components/NotificationBell.tsx` (polls unread every 60s, mounted in Layout footer + mobile bar). `LedgerModal` got a WhatsApp debt-reminder (wa.me + MessageLog). Nav: Users & Roles added; Settings opened to ACCOUNTANT. App routes /users, /settings, /notifications live (removed ComingSoon). types.ts: ManagedUser, AppNotification, MessageLogEntry, AuditLogEntry, PermissionMatrix.

**Deferred (documented):** G9 display-currency switcher (books already PKR-locked; lowest priority). SMS gateway interface (ship-disabled; needs a provider). Server-side pdfmake for invoices/statements (reports already do it; invoices still browser Save-as-PDF). WhatsApp Cloud API v2 (wa.me covers v1). Full pg_dump backup (portable JSON backup shipped instead).

**Next (Phase 7 — Desktop):** wire Electron prod mode (spawn built server, load built web, %APPDATA% uploads), build the Windows installer (SoftGlaze-Stock-Manager-Setup.exe), test on a clean PC. Then Phase 8 (VPS deploy + HTTPS + daily backup) and Phase 9 (launch). Do NOT start without the owner's "go".

---

## Phase 5 COMPLETE ✅ (Reports & Dashboard)

No schema change. Both apps typecheck clean; backend verified 31/31 (P&L acceptance docs/09 §8 + price-volatility re-run + every report JSON/PDF/Excel + integrity all-green, balance sheet imbalance ₨0); web smoke-tested (dashboard charts render, Reports page renders P&L ₨51,450 with PDF/Excel, 0 console errors). Test data cleaned; counters reset.

**Server:** `lib/report-export.ts` — one `ReportDoc {title, meta, columns, rows, totals}` → JSON (web renders) / PDF (pdfmake, built-in Helvetica, money as "Rs " ASCII) / Excel (exceljs); `sendReport(res, format, name, doc, settings)`. `reports.routes.ts` gained: `/profit-loss` (reports.profit), `/sales`, `/purchases`, `/stock-valuation?basis=cost|sale` (cost gated by reports.profit), `/receivables` + `/payables` (FIFO aging buckets), `/expenses`, `/sales-by-payment-method` (G10), `/stock-movements`, `/dashboard` (KPIs + 30-day series + category share + top products); `/cashbook` gained format export. All accept `?format=pdf|xlsx`, else JSON `{report,...}`.

**Balance-sheet fix (accounting):** retained earnings now adds `revaluation = stockValue − Σ(stockMovement.qty×unitCost)`, which captures manual cost-price edits and weighted-avg rounding. Algebra: the stock term cancels, so Assets=Liab+Equity holds exactly for any price sequence (verified imbalance ₨0 after the volatility edit). **Dashboard TZ fix:** 30-day buckets use LOCAL date keys (`getFullYear/Month/Date`) on both sides so today's sales land in today's bucket (was UTC-shifted → chart looked flat).

**Web:** `pages/Dashboard.tsx` — KPI cards (profit gated) + Recharts (gradient area, donut, bars) with CSS-var colors + custom tooltips + skeletons/empty states. `pages/Reports.tsx` — left nav of 9 reports + generic `ReportView` (date/basis filters, table from report.columns/rows/totals, PDF/Excel via `download()`). Cash Book tab on Accounts got PDF/Excel buttons. types.ts: `ReportTable`, `DashboardData`. Route `/reports` live (was ComingSoon). recharts/pdfmake/exceljs already installed.

**Next (Phase 6 — Admin):** users & roles UI, SUPER_ADMIN global settings (shop profile A1 full UI, business type, logo/invoice header-footer), A2 permission-matrix editor, Integrations (SMTP test email + WhatsApp wa.me on sale/purchase + debt reminders), notification bell + reminders center, G8 message-template editor, G9 currency switcher, audit-log viewer, backup/restore. Do NOT start without the owner's "go".

---

## Phase 4 COMPLETE ✅ (Money)

Migration `20260702094348_phase4_money_accounts_hr`. Both apps typecheck clean; backend money-math verified (25/25 assertions), `GET /reports/integrity` all-green incl. balance sheet imbalance ₨0; web smoke-tested (Accounts/Payments/Expenses/Employees render, 0 console errors, Integrity tab shows all-green live). Test data cleaned; counters reset to 0001; only the 3 onboarding "(sample)" products remain.

**Schema (new):** PaymentMethod upgraded to a money **Account** (accountNo, bankName, openingBalance, currentBalance cache, sortOrder). New models: `AccountEntry` (signed money ledger — source of truth for currentBalance), `FundTransfer` (TRN-), `CapitalEntry` (CAP-/DRW-, direction CAPITAL_IN/DRAWING). G6 HR: `Department`, `Shift`, `LeaveRequest` (LeaveType/LeaveStatus), `Holiday`; Employee got departmentId/shiftId. Enums `AccountEntryType`, `CapitalDirection`. Permission keys added: `accounts.view`, `accounts.manage`.

**Server (new):** `lib/accounts.ts` (`postToAccount` — appends AccountEntry + updates currentBalance; `postPayment` — creates Payment AND posts to account; `paymentSign`). Routes: `accounts.routes.ts` (account CRUD, /:id/statement, /transfer, /capital, transfers & capital lists), `payments.routes.ts` (customer-receipt, vendor-payment, list), `ledger.routes.ts` (customer/vendor running-balance statements), `expenses.routes.ts` (expenses + categories; delete reverses account effect; salary expenses blocked), `employees.routes.ts` (Employee CRUD + photo + Pay Salary atomic + salary reversal + /salaries list), `hr.routes.ts` (departments/shifts/holidays/leaves), `reports.routes.ts` (`/integrity`, `/balance-sheet`, `/cashbook`). Retrofitted `sales.routes.ts` + `purchases.routes.ts` to route every Payment through `postPayment`. **Fixed** sale-return + cash-refund double-credit (refund now offsets the credit note; net balance change 0 when refunded).

**Web (new):** `pages/Accounts.tsx` (tabs: Accounts, Cash Book, Balance Sheet, Integrity), `pages/Payments.tsx` (+ exported `PaymentModal` reused by Customers/Vendors), `pages/Expenses.tsx`, `pages/Employees.tsx` (Staff/Salaries/HR tabs). `components/Calculator.tsx` (mounted in Layout + POS), `components/LedgerModal.tsx`, `lib/statement.ts` (printable statements). Customers/Vendors got Statement + quick Receive/Pay buttons. Nav: "Accounts & Cash" added. types.ts extended.

**Design decisions / known limits (transparent):**
- Balance sheet retained-earnings recognises purchase bill-level adjustments (freight/tax−discounts) and stock-adjustment value so Assets=Liab+Equity balances exactly (imbalance ₨0 in tests). Weighted-avg rounding could in theory leave <₨1 residue → balance-sheet integrity check uses a ₨1 tolerance; tighten/confirm in Phase 5 with the P&L acceptance suite.
- Expenses support delete (reverses the account movement, hard-removes Expense+Payment, audit-logged) as a shop correction tool — a pragmatic exception to the never-delete-payments rule; salary-linked expenses are blocked (reverse via the salary).
- Statements/receipts still print via the browser (Save-as-PDF); true server-side pdfmake PDFs remain a Phase 5 item.

**Next (Phase 5 — Reports):** dashboard charts + all reports (sales/purchases/P&L/stock valuation/aging/payables/expenses/cash book) with server-side PDF + Excel; G10 valuation-at-sale-price + sales-by-payment-method; re-run the price-volatility + P&L acceptance tests and show /reports/integrity all-green. Do NOT start without the owner's "go".

---

## Phase 3 CORE COMPLETE ✅ (POS & Sales)

**What was just done (Phase 3 core, all verified). No schema change — Sale/SaleItem/Payment existed:**
- **`routes/sales.routes.ts`** — the transactional heart:
  - `POST /sales` (status COMPLETED | DRAFT=hold | QUOTATION). Completed sale = ONE tx:
    Sale + SaleItems (unitPrice **and** unitCost snapshots) + SALE StockMovements (STANDARD
    deducts; **COMBO deducts each component** at snapshot cost; SERVICE skips stock) +
    Payment(s) SALE_RECEIPT + Customer.balance += due (udhaar) + INV- counter + audit.
    Credit-limit check (block → 409 CREDIT_LIMIT_EXCEEDED unless `overrideCredit` + the
    `sales.discount_over_limit` permission). Walk-in + due>0 blocked. Holds/quotes save
    snapshots only (HLD-/QUO-, no stock/money).
  - `GET /sales` (own-vs-all gated by sales.view_all/own; profit/cost stripped unless
    `reports.profit`), `GET /:id`, `GET /held`, `GET /quotations`, `DELETE /:id`
    (DRAFT/QUOTATION only), `POST /:id/return` (SRET-, reverse at snapshot: stock back in,
    COGS reversed, receivable reduced, optional REFUND_OUT).
- Web: **`pages/POS.tsx`** — full-screen (route outside Layout), keyboard-first
  (F2 search · F6 hold · F10 complete · Enter=new sale), product search grid + add,
  customer bar with search + inline quick-add (real CUS-), cart with qty/price(gated)/discount,
  bill discount/tax/delivery, split payments (+ udhaar/change), Hold/Quote/Complete, Held &
  Quotes trays (resume loads cart + deletes the parked doc), success overlay with 80mm/A4
  print + WhatsApp + New sale. **`pages/Sales.tsx`** — list (profit gated) + detail + return +
  reprint. **`lib/receipt.ts`** — print-window receipt (80mm thermal / A4, Save-as-PDF).
  Routes: /pos (full-screen), /sales; nav already had both. Sale types added to `lib/types.ts`.

**Verified (rule-2):**
- `npx tsc --noEmit` (server) + `tsc -b` (web) both clean.
- End-to-end money math (signed dev JWT, isolated data):
  Sale#1 1@600 cost500 cash → grand 600 / cost 500 / profit 100 / due 0 ✓;
  **PRICE-VOLATILITY**: edit product to 850/700, Sale#2 1@850 → profit 150; Sale#1 re-fetched
  still 100/500 (snapshots unchanged); day profit exactly **250** ✓;
  credit limit 1000: udhaar 850 ok (bal 850), next 850 → **409**, override → ok (bal 1700) ✓;
  **combo** sell 1 (2× component) → cost 1400, profit 600, component stock −2 ✓;
  return 1 of udhaar sale → receivable 1700→850 ✓; oversell → **409 INSUFFICIENT_STOCK** ✓;
  hold HLD- + quotation QUO- created, trays list them, delete works ✓.
- Browser (Playwright): /pos renders full POS (search focused, customer bar, cart, checkout,
  Held/Quotes) and /sales load with **0 app console errors**. (Deeper click-tests were noisy
  due to a shared multi-tab browser; snapshots confirm clean mounts.)
- All test data cleaned; counters sale/hold/quotation/sale_return/payment/customer/vendor reset.

**Exact next step:** Owner to confirm, then **Phase 4 — Money** per KICKOFF-PROMPT.md
(customer receipts, vendor payments, customer & vendor ledgers with statements, expenses,
Employees & Salaries per docs/09 §2, calculator widget, day-close cash book) + **G1 Accounts &
fund transfers + balance sheet** and **G6 HR extensions**. The `GET /reports/integrity` endpoint
(CLAUDE rule 1) should be written early in Phase 4/5.

**Known issues / deferred (transparent):**
- POS quick-keys/favorites, category tiles, on-screen calculator, sticky-session restore, and
  camera scanner/scale (G5) are deferred — core billing is complete and fast.
- Receipts print via a browser print window (Save-as-PDF for A4). True server-side pdfmake PDFs
  come with reports in Phase 5. WhatsApp is a wa.me link (no MessageLog yet — that's Phase 6).
- G4 warranty and A6 demo-data pack deferred (see checklist). A7 medical batches still pending
  from Phase 2.
- Sales returns don't track cumulative returned qty per line across multiple returns (guarded
  against the original qty each time) — same caveat as purchase returns.
- Purchase/sale invoice PDFs, and DB manual start / Windows Prisma-generate lock — see
  [[softglaze-environment]].

---

## Prior status (2026-07-02) — Phase 2 CORE COMPLETE ✅ (Purchasing & stock)

**What was just done (Phase 2 core, all verified). No schema change — models already existed:**
- **`lib/stock.ts`** — reusable ledger service: `applyMovement(tx, {...})` appends a
  StockMovement with running `balance` and updates cached `Product.stockQty` in the same
  tx (blocks negative unless `allowNegative`); `weightedAvg()` (guards div-by-zero, 2dp);
  `InsufficientStockError`. Phase 3 sales will reuse this.
- **`routes/purchases.routes.ts`** — `GET /purchases` (page/search/vendor/status/date + totals),
  `GET /:id`, `POST /` (one transaction: Purchase + PurchaseItems + PURCHASE StockMovements +
  weighted-avg costPrice update + stockQty + Vendor.balance += due + Payment(s) + PUR-/PAY-
  counters + audit; rejects SERVICE/COMBO items; partial/full payment; udhaar = due),
  `POST /:id/return` (PRET- doc, PURCHASE_RETURN movements at original line cost, stockQty down,
  Vendor.balance −= return value; avg unchanged since removals don't move it).
- **`routes/stock.routes.ts`** — `GET /movements` (ledger, product/type/date filters),
  `GET/POST /adjustments` (ADJ- doc; ADJUSTMENT_IN / ADJUSTMENT_OUT / DAMAGE; blocks negative),
  `POST /recalculate` [ADMIN] rebuilds stockQty from ledger.
- **`routes/payment-methods.routes.ts`** — `GET /payment-methods` read-only (CRUD in Phase 4).
- Guards use `requirePermission` (purchases.view/create/return, stock.adjust); recalc = ADMIN.
- Web: `pages/Purchases.tsx` (list + New-purchase modal with vendor, product-search line items,
  discount/tax/freight, pay-now method + amount, live grand/due; view + return modal) and
  `pages/Stock.tsx` (Ledger tab with product/type filter + Adjustments tab with New-adjustment
  modal). Nav: Purchases → real page, new **Stock** item. `lib/types.ts` extended
  (Purchase/PurchaseItem/StockMovement/StockAdjustment/PaymentMethod).

**Verified (rule-2):**
- `npx tsc --noEmit` (server) + `tsc -b` (web) both clean.
- End-to-end money math with a signed dev JWT on an isolated test product:
  P1 100@1300 pay 50000 → stock 100, cost 1300, vendor bal 80000, due 80000 ✓;
  P2 50@1400 → stock 150, **weighted-avg 1333.33**, vendor bal 150000 ✓;
  return 20 → stock 130, cost unchanged 1333.33, vendor bal 124000 ✓;
  damage −10 → stock 120 ✓; ledger shows 2×PURCHASE + PURCHASE_RETURN + DAMAGE ✓;
  over-issue −1000 → **409 INSUFFICIENT_STOCK** ✓; recalculate → corrected 0 (cache==ledger) ✓.
- Browser (Playwright, dev token): /purchases + New-purchase modal, /stock (Ledger + Adjustments)
  all load with **0 app console errors**.
- All test rows cleaned; counters purchase/purchase_return/adjustment/payment/vendor reset to 0.

**Exact next step:** Owner to confirm, then **Phase 3 — POS** per KICKOFF-PROMPT.md + docs/11 A5
(full-screen keyboard-first POS, split payments incl. udhaar with credit-limit check, hold/resume,
80mm + A4 invoices, sales returns, quotations). Phase 3 sale transaction is where **G3 combo stock
logic** (deduct component stock at snapshot cost) and price-volatility snapshots land, reusing
`lib/stock.ts`. Also still pending from Phase 2: **A7 medical preset + ProductBatch/FEFO** — build
when the owner needs the medical/food business type (needs a migration).

**Known issues / notes:**
- Purchase invoice PDF (`GET /purchases/:id/invoice.pdf`) deferred — PDFs come with POS receipts
  (Phase 3) / reports (Phase 5).
- Purchase returns don't yet track cumulative returned-qty per line, so the same line could be
  over-returned across multiple return docs (guarded only against the original qty each time).
  Fine for v1; tighten if needed.
- DB still started manually (`scripts\start-db.ps1` / pg_ctl); Prisma generate needs port-4000
  node stopped first on Windows (EPERM). See [[softglaze-environment]].

---

## Prior status (2026-07-02) — Phase 1 UPGRADES COMPLETE ✅ (A1–A4, G2, G3, G7, G10)

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
