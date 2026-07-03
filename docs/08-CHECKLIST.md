# SoftGlaze — Progress Checklist

Tick things off as we build. Mirrors the phases in 01-BUILD-PLAN.md.

## Phase 0 — Setup
- [x] Node 20+ installed, VS Code open on this folder (Node v22.21.1)
- [x] Postgres running (no Docker on this PC → portable PostgreSQL 16.9 at `..\pg`, start with `scripts\start-db.ps1`)
- [x] npm install (root) completes
- [x] .env files created from .env.example (server + web)
- [x] npx prisma migrate dev runs clean (migration `20260702033050_init`)
- [x] Seed runs → owner account registered (first account = SUPER_ADMIN, verified in DB; registration closes after)
- [x] npm run dev → API health OK, login page loads, dark/light toggle works (verified in browser at 1440px & 375px)

## Phase 1 — Master data
- [x] Business Type presets + first-run onboarding screen (seeds categories/units/sample products)
- [x] Categories CRUD + sub-categories (+ optional images)
- [x] Units + conversions (1 t = 1000 kg verified)
- [x] Products CRUD + image upload (webp + thumbnail) + SKU auto (CEM-0001 style) + opening stock via ledger
- [x] Customers CRUD  ·  [x] Vendors CRUD (codes CUS-/VEN-, opening balances, delete-protection when balance ≠ 0)

### Phase 1 upgrades (docs/11 A + docs/12 G — added 2026-07-02, completed 2026-07-02)
- [x] A1 Shop Profile foundation (expanded settings keys + `GET /settings/public` + logo/favicon pipeline; name/logo wired into sidebar, login, tab title. Full UI in Phase 6)
- [x] A2 Permission keys + `requirePermission` middleware (40-key catalog, RolePermission defaults seeded, in-memory cache, matrix API `GET/PUT /permissions/matrix`; matrix editor UI in Phase 6)
- [x] A3 Bulk product import wizard (CSV/Excel/XML/TXT/paste, auto-mapping, saved templates, dry-run report, chunked commit with per-row salvage) + product export (CSV/Excel)
- [x] A4 `<ImageDropzone>` global drag-drop uploader (drag/click/paste + client compression; used in products, categories, brands)
- [x] G2 Brands (model + CRUD route + page + product filter/field + import column with auto-create)
- [x] G3 Product types STANDARD / SERVICE / COMBO (+ ComboItem model; SERVICE/COMBO skip stock; combo stock logic lands in Phase 2)
- [x] G7 Import wizard targets: Customers + Vendors (dedupe by phone, opening balances as proper entries)
- [x] G10 Product dimensions (L×W×H + weight) fields · favicon + page title in branding

## Phase 2 — Purchasing & stock
- [x] Purchase entry → stock in + weighted avg cost (POST /purchases, one transaction; verified 100@1300 then 50@1400 → avg 1333.33)
- [x] Stock adjustments (POST /stock/adjustments, damage/count/expiry)  ·  [x] Purchase returns (POST /purchases/:id/return, stock out + payable reduced)
- [x] Low stock alerts (GET /products/low-stock + status=low filter; dashboard widget lands in Phase 5)
- [x] Stock ledger (GET /stock/movements) + POST /stock/recalculate integrity rebuild
- [ ] A7 Medical Store preset + generic batch/expiry FEFO (`track_batches` flag) — deferred (needs ProductBatch migration; owner is building-materials, not needed yet)
- [ ] G3 Combo stock logic (selling a combo deducts component stock at snapshot costs) — lands in Phase 3 (needs the sale transaction; ComboItem model is ready)

## Phase 3 — POS
- [x] POS screen (full-screen, keyboard-first F2/F6/F10, product search+add, customer picker + inline quick-add, cart with qty/price/discount, success screen) — quick-keys/category-tiles/calculator deferred to a later polish
- [x] Cash / credit (udhaar) / split payments + credit-limit block with permission override
- [x] Thermal 80mm receipt + A4 invoice via print window (Save-as-PDF) — true server-side pdfmake PDF deferred to Phase 5
- [x] Hold/resume (DRAFT + Held tray)  ·  [x] Sales returns (reverse at snapshot, stock back, receivable adjusted)  ·  [x] Quotations (QUOTATION + Quotes tray)
- [x] G3 combo stock logic — selling a COMBO deducts component stock at snapshot cost (verified −2 per combo)
- [x] Price-volatility acceptance test PASSED (sell @600/cost500 → edit to 850/700 → sell again → day profit exactly 250; prior sale unchanged)
- [ ] G4 Warranty/guarantee fields + invoice print + report — deferred (needs schema fields)
- [ ] G5 Camera barcode scanner + weighing scale (feature-flagged) — deferred (hardware-dependent)
- [ ] A6 Demo data pack (`db:seed:demo`) + full P&L proof — deferred (best run after Phase 4–5 money/reports exist)

## Phase 4 — Money  (completed 2026-07-02)
- [x] Customer receipts (POST /payments/customer-receipt) · [x] Vendor payments (POST /payments/vendor-payment) — one transaction each: Payment + AccountEntry + party balance + audit
- [x] Ledgers/statements — GET /ledger/customer/:id & /ledger/vendor/:id (reconstructed running-balance statement) + client PDF print (Save-as-PDF; true server-side pdfmake still Phase 5)
- [x] Expenses (incl. Miscellaneous) — CRUD + categories; each expense = Payment(EXPENSE) out of an account + P&L hit
- [x] Employees & Salaries (docs/09 §2) — profiles + photo, Pay Salary atomically creates SalaryPayment + Expense(Salaries) + Payment(EXPENSE); one-per-month DB guard; salary reversal
- [x] Calculator widget — global floating panel + F12/Ctrl+K hotkey, keyboard entry, memory, "→ field" push (mounted in Layout + POS)
- [x] Day-close cash book — GET /reports/cashbook (per-account opening/in/out/closing for a date range)
- [x] G1 Accounts & fund transfers — PaymentMethod upgraded to money accounts (opening/current balance, bank fields); AccountEntry ledger is source of truth (postToAccount/postPayment); TRN- transfers; CAP-/DRW- capital & drawings; per-account statement; **Balance Sheet** (Assets = Liab + Equity, verified imbalance ₨0)
- [x] `GET /reports/integrity` (built early per CLAUDE rule 1) — stock cache, account cache, sale/purchase math, customer/vendor reconciliation, payment↔ledger, balance-sheet — **all-green verified** (25/25 test assertions)
- [x] G6 HR extensions — Department, Shift, Holiday, LeaveRequest (approve/reject) — lightweight, one section each on the Employees → HR tab
- Note: sales & purchases retrofitted to post every payment through the account ledger; fixed a sale-return+cash-refund double-credit (refund now offsets the credit note). Verified end-to-end, test data cleaned, counters reset to 0001.

## Phase 5 — Reports  (completed 2026-07-02)
- [x] Sales register · Purchase register · **Profit & Loss** · Stock valuation · Stock movements (server-side, rebuilt from ledgers)
- [x] Receivables aging · Payables aging · Expenses by category · Cash book (FIFO aging into 0–30/31–60/61–90/90+ buckets)
- [x] PDF download on all · [x] Excel download on all — one generic `ReportDoc` drives JSON + pdfmake PDF + exceljs Excel (`lib/report-export.ts`, `sendReport`)
- [x] Dashboard cards + premium Recharts (30-day gradient area sales+profit, category donut, top-products bar, receivables-aging bar); low-stock badge; profit gated by `reports.profit`
- [x] G10 Valuation at **sale-price** variant · **Sales by payment method** report · price-volatility + P&L acceptance (docs/09 §8) **re-run: 31/31 pass, integrity all-green, balance sheet ₨0**
- Fix: balance sheet now recognises inventory **revaluation** (manual cost edits + weighted-avg rounding) in retained earnings → Assets = Liabilities + Equity exactly through price changes. Fixed a dashboard timezone bug (day buckets now use local dates so today's sales appear).

## Phase 6 — Admin  (completed 2026-07-02)
- [x] Users & roles UI (create/edit/reset-password/disable; role rules enforced server-side — owner protected, no self-lockout, only owner grants Admin) · [x] Permission enforcement verified (requirePermission across all routes)
- [x] Settings: full Shop Profile (identity/contact/legal/invoice/regional) + logo & favicon upload + **live invoice preview** · [x] Audit log viewer (GET /audit, filters) · [x] Backup/restore (portable JSON export + wipe-and-restore, verified round-trip keeps integrity green)
- [x] A1 Shop Profile full UI with live invoice preview
- [x] A2 Roles & Permissions matrix editor (SUPER_ADMIN — toggle per role, reset-to-defaults, live cache invalidation)
- [x] Integrations (SUPER_ADMIN): SMTP (host/port/secure/user/pass + **Send test email** via nodemailer, secret masked & never overwritten by blank) + WhatsApp wa.me mode; MessageLog for every send; WhatsApp debt-reminder from the customer ledger
- [x] Notifications: in-app **bell** (unread badge, dropdown, mark-read) + Notifications centre + server sweep (low-stock / debt / payable, deduped) + **daily node-cron** at `low_stock_sweep_time`
- [x] G8 Message template editor (WhatsApp receipt & reminder templates with {placeholder} chips) — SMS gateway interface deferred (ship-disabled, needs a provider)
- [ ] G9 Display-currency switcher — deferred (display-only nicety; books already locked to PKR; lowest priority, revisit post-launch)
- Verified: both apps tsc clean; 21/21 admin/integration assertions incl. backup export→wipe→restore with integrity all-green; web smoke (Users + all Settings tabs + bell, 0 console errors). Test residue cleaned.

## Phase 7 — Desktop  (wiring complete 2026-07-03; installer build + clean-PC test are owner steps)
- [x] Single-origin serving: Express serves the built web app + API on one port (SERVE_WEB / NODE_ENV=production); SPA fallback; CSP relaxed for same-origin inline styles/charts — verified (SPA at `/`, API stays JSON, unknown /api still 404)
- [x] Electron production shell (`apps/desktop/main.cjs`): spawns the BUILT server via `ELECTRON_RUN_AS_NODE` (no separate Node needed), config file for DATABASE_URL + auto JWT secrets, uploads → `%APPDATA%/SoftGlaze/uploads`, waits for health then loads `http://localhost:4000`, single-instance lock, wa.me/http links open in the real browser, kills server on quit. Preload (context-isolated) + `SOFTGLAZE_DEV=1` live-reload mode.
- [x] **Runtime verified**: the built `node dist/index.js` (exact process Electron spawns) boots in production mode, connects to Postgres, serves the app + API, schedules the daily cron — all clean.
- [x] `electron-builder` NSIS config complete + **`npm run dist` now actually builds** `apps/desktop/release/SoftGlaze-Stock-Manager-Setup-0.1.0.exe` (config moved to `apps/desktop/electron-builder.cjs` with `beforeBuild:()=>false` + `npmRebuild:false` so it never prunes the shared node_modules; `electronVersion` pinned; `predist` uses `--prefix`; extraResources slimmed to runtime deps). Fixed a packaged-mode uploads bug (`path.join`→`path.resolve`). See `apps/desktop/README.md`.
- [ ] Electron GUI launch + install & run on the shop PC / a clean PC — **owner step** (needs the machine/GUI; unsigned installer).
- [x] Decision: DB packaging = **(A) Postgres on the PC** (built, recommended by owner — zero accounting risk).

## Post-audit gap closure (2026-07-03)
- [x] 4-agent audit of all feature docs vs. code → core 100% built; closed 10 convenience/reporting gaps (per-line POS discount, sales report filters by customer/product/category, payment allocation to a specific bill, purchase WhatsApp + PK phone normalisation, Messages page, dashboard recent-invoices/low-stock lists, top-customers report, immediate low-stock notification, credit-limit bell, salary report + **logo on all report PDFs**, my-account self password/name, email templates).
- [x] **Accounting fix:** opening stock (product `openingStock`) now recognised as **opening capital (equity)** in the balance sheet — previously it added inventory with no equity counterpart, so the sheet would break the moment real inventory is entered (Phase 9). Verified on a throwaway DB: 12/12 money checks incl. integrity all-green + balance sheet ₨0.

## Phase 8 — Server
- [ ] VPS live with HTTPS  ·  [ ] Daily DB backup cron  ·  [ ] Tested from phone browser

## Phase 9 — Launch
- [ ] Real inventory entered  ·  [ ] Staff accounts made  ·  [ ] One full shop-day test

## Future roadmap (docs/10) — building post-launch features early on owner request
- [x] **F1 · Post-dated cheque tracking** — RECEIVED/ISSUED register; a pending cheque settles the party balance into a "Cheques in Hand"/"Post-dated Cheques" holding account, then CLEARS to a bank account or BOUNCES/CANCELS (reversed, party owes again). Cheque-due bell alerts. Migration `20260703082504_f1_cheques`. Verified 19/19 on a throwaway DB, integrity all-green + balance sheet ₨0.
- [x] **Accounting fix (launch-critical):** opening customer/vendor balances now recognised as **opening capital (equity)** — same family as the opening-stock fix. Both were latent balance-sheet breakers that only trigger once real opening inventory + opening udhaar are entered at launch.
- [x] **F2 · Delivery challans** — dispatch an invoice in multiple truck loads; each challan tracks delivered vs pending (no money/stock effect — stock already moved at invoice). Dispatch modal + A4 challan print + Pending Deliveries report. Migration `20260703…_f2_delivery_challans`. Verified 10/10 on a throwaway DB, integrity green.
- [x] **F3 · Advance bookings with rate lock** — book goods at today's LOCKED price with an advance; the advance is a liability (a CUSTOMER_RECEIPT → customer credit), never revenue. Fulfilling generates a real invoice (INV-) at the locked rate — stock deducts, COGS snapshots at current cost, revenue recognised — and the held advance nets in the customer's running balance. Cancel refunds the unused advance or leaves it as credit. Bookings page (create/deliver/cancel + A4 rate-lock slip) + Open Bookings report + summary cards. Migration `20260703093844_f3_advance_bookings`. Verified 24/24 on a throwaway DB (incl. price-rise rate-lock proof), integrity all-green + balance sheet ₨0.
- [ ] F4 estimator · F5 attendance · F6 price groups … (docs/10 order)
