# SoftGlaze — Master Build Plan

**Product:** SoftGlaze Stock Manager — complete Stock Management + POS system.
First customer: a building materials shop
(iron rods, cement, windows, doors, hardware, and all construction materials).

**Targets:**
1. **Desktop app** (Windows-first, via Electron) — works fully offline on shop PC
2. **Browser app** (same codebase, deployed to a VPS/server) — SaaS-style access from anywhere

**Golden rule:** One codebase. The web app IS the desktop app (Electron just wraps it).
Anything we build works in both automatically.

---

## Tech Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast dev, huge ecosystem |
| Styling | Tailwind CSS v4 + CSS variables | Dark/light theming in minutes |
| State/Data | TanStack Query + Zustand | Server cache + light UI state |
| Backend | Node.js + Express + TypeScript | Simple, reliable, easy to host |
| ORM | Prisma | Type-safe DB, easy migrations |
| Database | PostgreSQL (server) / same Postgres for desktop via bundled service — SQLite fallback documented | Production grade |
| Auth | JWT (access + refresh) + bcrypt, RBAC roles | Standard, secure |
| PDF | pdfmake (invoices, reports) | Pure JS, works everywhere |
| Excel | exceljs | Full .xlsx export |
| Images | Local `/uploads` folder (server disk) — S3 optional later | Simple for one shop |
| Desktop shell | Electron + electron-builder | Installer (.exe) output |
| Charts | Recharts | Dashboard graphs |

---

## Phases (we do these together in VS Code, in order)

### Phase 0 — Environment & Scaffold ✅ (this folder)
- [x] Monorepo structure (`apps/server`, `apps/web`, `apps/desktop`)
- [x] Full Prisma database schema
- [x] Auth skeleton (register / login / JWT / roles)
- [x] Web shell: theme switcher (dark/light), login, register, dashboard layout
- [ ] `npm install` in all apps, run Postgres (docker or installed), run first migration
- [ ] Seed admin user + demo categories/products

### Phase 1 — Core Master Data (Week 1)
- [ ] **Categories** CRUD (Cement, Iron Rods/Sariya, Windows, Doors, Pipes, Hardware, Paint, Electrical…) with nesting (parent → child)
- [ ] **Units** (bag, kg, ton, piece, ft, sq-ft, bundle, length) + unit conversion (e.g. 1 ton = 1000 kg for rods)
- [ ] **Products** CRUD: SKU, barcode, category, unit, cost price, sale price, wholesale price, min-stock alert level, images (multi-upload), description
- [ ] **Customers** CRUD: name, phone, address, CNIC/tax no, opening balance, credit limit
- [ ] **Vendors/Suppliers** CRUD: same fields + bank details
- [ ] Image upload pipeline (resize + thumbnail)

### Phase 2 — Purchasing & Stock (Week 2)
- [ ] **Purchase Orders** → receive stock (vendor, items, qty, cost, invoice no, date)
- [ ] Stock ledger: every movement recorded (PURCHASE, SALE, RETURN, ADJUSTMENT, DAMAGE)
- [ ] **Stock Adjustments** (damage, count corrections) with reason + audit
- [ ] Weighted-average cost calculation (correct profit later)
- [ ] Low-stock alerts on dashboard
- [ ] Purchase returns to vendor

### Phase 3 — POS & Sales (Week 2–3) ⭐ the heart
- [ ] **POS screen**: product search (name/SKU/barcode), category tiles, cart, qty/price edit, discounts (line + bill), tax, customer picker (or walk-in)
- [ ] Payment: cash / bank / card / credit (udhaar) / split payment
- [ ] Hold & resume bills
- [ ] **Invoice print**: thermal 80mm receipt AND A4 PDF invoice with shop logo
- [ ] Sales returns (against invoice)
- [ ] Quotations → convert to invoice
- [ ] Keyboard shortcuts (F-keys) for fast billing

### Phase 4 — Payments & Ledgers (Week 3)
- [ ] Customer payments (receive against credit balance), partial payments
- [ ] Vendor payments (pay against purchase dues)
- [ ] **Customer ledger** & **Vendor ledger** (statement of account, running balance)
- [ ] Payment methods master (Cash, Bank accounts, JazzCash/EasyPaisa etc.)
- [ ] Expenses module (rent, salaries, electricity, transport) with categories
- [ ] Day-close / cash register summary

### Phase 5 — Reports & Analytics (Week 4)
- [ ] Dashboard: today's sales, profit, receivables, payables, low stock, top products, sales chart
- [ ] Reports (every one: on-screen table + **PDF download** + **Excel download**):
  - Sales report (day/range, by customer, by product, by category, by user)
  - Purchase report
  - **Profit & Loss** (revenue − COGS − expenses)
  - Stock report (current stock + valuation)
  - Stock movement/ledger report
  - Customer receivables (aging)
  - Vendor payables
  - Expense report
  - Daily cash book
- [ ] Date-range filters everywhere

### Phase 6 — Users, Roles & Settings (Week 4)
- [ ] Roles: **Admin**, **Manager**, **Cashier**, **Accountant** (permission matrix in 04-FEATURES.md)
- [ ] User management (create, disable, reset password)
- [ ] Activity/audit log (who did what, when)
- [ ] Shop settings: name, logo, address, phone, tax %, currency (PKR), invoice footer text, receipt size
- [ ] Backup & restore (DB dump download)

### Phase 7 — Desktop Packaging (Week 5)
- [ ] Electron wrapper loads the app, spawns the local server
- [ ] electron-builder → Windows installer (.exe), auto-launch server, tray icon
- [ ] Offline-first check + local Postgres/SQLite setup guide
- [ ] Auto-update channel (optional)

### Phase 8 — Server Deployment (Week 5)
- [ ] VPS setup (Ubuntu + Nginx + PM2 + Postgres) — full guide in 07-DEPLOYMENT.md
- [ ] HTTPS via Let's Encrypt, domain setup
- [ ] Multi-tenant flag (optional future: sell as SaaS to other shops)
- [ ] Monitoring + automatic DB backups (cron)

### Phase 9 — Polish & Production Hardening
- [ ] Form validation everywhere (zod), error toasts, loading skeletons
- [ ] Urdu-friendly fonts / RTL-ready labels (optional)
- [ ] Rate limiting, helmet, input sanitization
- [ ] Full test pass of every money path (sale → stock → ledger → report)
- [ ] Data entry of your real inventory

---

## How we work together

1. Open this folder in VS Code.
2. Follow `README.md` Quick Start to get it running (15 min).
3. Come back to Claude with: *"Phase 1 — let's build the Categories module"* (or paste errors).
4. We build phase by phase; each phase ends with you testing on real shop scenarios.

**Definition of done for the whole project:** you can run your entire shop day —
open register → sell on cash & credit → receive stock → pay vendor → collect customer payment →
print invoices → close day → download P&L PDF — without touching anything else.

---

## v2 Additions (see docs/09-EXTENDED-FEATURES.md for full specs)

| Addition | Lands in |
|---|---|
| Business Type presets + onboarding (any-business support, sample data) | Phase 1 |
| Employees & Salaries (auto-Expense, one salary/employee/month) | Phase 4 |
| Miscellaneous & all expense heads feeding P&L | Phase 4 |
| Built-in calculator widget (global + POS) | Phase 4 |
| Premium charts (gradient area, donut, aging bars) | Phase 5 |
| P&L acceptance tests + /reports/integrity all-green gate | Phase 5 |
| SUPER_ADMIN global settings, logo, invoice header/footer | Phase 6 |
| SMTP email + WhatsApp messages on sale/purchase + debt reminders | Phase 6 |
| Notification bell + reminders center (stock, debt, payables) | Phase 6 |
| Windows installer build: SoftGlaze-Stock-Manager-Setup.exe | Phase 7 |

**Repo:** https://github.com/softglazee/SoftGlaze-Stock-Management-POS — commit+push after every module.
