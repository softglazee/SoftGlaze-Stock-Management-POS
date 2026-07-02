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
- [ ] Categories CRUD + sub-categories
- [ ] Units + conversions
- [ ] Products CRUD + image upload + SKU auto
- [ ] Customers CRUD  ·  [ ] Vendors CRUD

## Phase 2 — Purchasing & stock
- [ ] Purchase entry → stock in + weighted avg cost
- [ ] Stock adjustments  ·  [ ] Purchase returns
- [ ] Low stock alerts

## Phase 3 — POS
- [ ] POS screen (search, tiles, cart)
- [ ] Cash / credit / split payments
- [ ] Thermal receipt + A4 PDF invoice
- [ ] Hold/resume  ·  [ ] Sales returns  ·  [ ] Quotations

## Phase 4 — Money
- [ ] Customer receipts  ·  [ ] Vendor payments
- [ ] Ledgers/statements  ·  [ ] Expenses  ·  [ ] Day close

## Phase 5 — Reports
- [ ] Sales · Purchases · P&L · Stock valuation · Movements
- [ ] Receivables aging · Payables · Expenses · Cash book
- [ ] PDF download on all  ·  [ ] Excel download on all
- [ ] Dashboard cards + charts

## Phase 6 — Admin
- [ ] Users & roles UI  ·  [ ] Permission enforcement tested per role
- [ ] Settings (logo, tax, invoice footer)  ·  [ ] Audit log  ·  [ ] Backup/restore

## Phase 7 — Desktop
- [ ] Electron runs app  ·  [ ] Windows installer built  ·  [ ] Tested on shop PC

## Phase 8 — Server
- [ ] VPS live with HTTPS  ·  [ ] Daily DB backup cron  ·  [ ] Tested from phone browser

## Phase 9 — Launch
- [ ] Real inventory entered  ·  [ ] Staff accounts made  ·  [ ] One full shop-day test
