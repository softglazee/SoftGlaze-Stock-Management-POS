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
- [ ] POS screen exactly per docs/11 A5 (quick-add customer, quick keys, split pay, success screen)
- [ ] Cash / credit / split payments
- [ ] Thermal receipt + A4 PDF invoice
- [ ] Hold/resume  ·  [ ] Sales returns  ·  [ ] Quotations
- [ ] G4 Warranty/guarantee fields + invoice print + report
- [ ] G5 Camera barcode scanner + weighing scale (feature-flagged)
- [ ] A6 Demo data pack (`db:seed:demo`) + P&L proof + docs/12 price-volatility acceptance test

## Phase 4 — Money
- [ ] Customer receipts  ·  [ ] Vendor payments
- [ ] Ledgers/statements  ·  [ ] Expenses  ·  [ ] Day close
- [ ] G1 Accounts & fund transfers (account balances, TRN- transfers, deposits/drawings, balance sheet + integrity check)
- [ ] G6 HR extensions (departments, shifts, leave requests, holidays)

## Phase 5 — Reports
- [ ] Sales · Purchases · P&L · Stock valuation · Movements
- [ ] Receivables aging · Payables · Expenses · Cash book
- [ ] PDF download on all  ·  [ ] Excel download on all
- [ ] Dashboard cards + charts
- [ ] G10 Valuation at sale price variant · Sales by payment method · re-run price-volatility test

## Phase 6 — Admin
- [ ] Users & roles UI  ·  [ ] Permission enforcement tested per role
- [ ] Settings (logo, tax, invoice footer)  ·  [ ] Audit log  ·  [ ] Backup/restore
- [ ] A1 Shop Profile full UI with live invoice preview
- [ ] A2 Roles & Permissions matrix editor (SUPER_ADMIN)
- [ ] G8 Message template editor (+ SMS gateway interface, shipped disabled)
- [ ] G9 Display-currency switcher (books stay PKR)

## Phase 7 — Desktop
- [ ] Electron runs app  ·  [ ] Windows installer built  ·  [ ] Tested on shop PC

## Phase 8 — Server
- [ ] VPS live with HTTPS  ·  [ ] Daily DB backup cron  ·  [ ] Tested from phone browser

## Phase 9 — Launch
- [ ] Real inventory entered  ·  [ ] Staff accounts made  ·  [ ] One full shop-day test
