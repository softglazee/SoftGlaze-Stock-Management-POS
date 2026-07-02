# CLAUDE.md — SoftGlaze Stock Manager

You (Claude) are the lead engineer on this project. Read this file fully before doing anything.
This file is the contract for every session. When in doubt, this file + `docs/` win.

## What we are building

**SoftGlaze Stock Manager** — a premium, production-ready Stock Management + POS system.
- Repo: https://github.com/softglazee/SoftGlaze-Stock-Management-POS
- Owner's first business: building materials shop in Pakistan (iron rods/sariya, cement, windows, doors, hardware) — but the app is **business-agnostic**: any shop can use it by picking a Business Type preset.
- Two targets from ONE codebase: **desktop app** (Electron, Windows installer at the end) and **browser app** (deployed to a VPS).
- Currency context: PKR (₨). Credit culture: customers buy on **pay-later (udhaar)** and we also buy from vendors on pay-later. Both are first-class flows, not edge cases.

## Read order (once per session if context is fresh)

1. This file
2. `docs/01-BUILD-PLAN.md` — the phase roadmap (source of truth for what's next)
3. `docs/11-SCOPE-UPGRADES.md` **Section A** and `docs/12-GAP-CLOSURE.md` — CORE scope
   merged into the main phases (A1–A7, G1–G10 + the price-volatility guarantee)
4. The doc for the module being built (`docs/04-FEATURES.md`, `docs/09-EXTENDED-FEATURES.md`, `docs/05-API-REFERENCE.md`, `docs/06-UI-DESIGN-SYSTEM.md`)
5. `docs/08-CHECKLIST.md` — tick items off as they're completed (edit the file)
6. `docs/10-FUTURE-ROADMAP.md` + docs/11 Section B — post-Phase-9 features only (do NOT build early)

## Non-negotiable engineering rules

1. **Accounting accuracy is sacred.** Profit & Loss must never mismatch. Rules:
   - P&L is **accrual-based**: a sale counts as revenue when invoiced (even if unpaid/udhaar); a purchase counts as inventory cost when received (even if unpaid). Cash movements are tracked separately (cash book).
   - `Gross Profit = Sales − Sales Returns − COGS` where COGS uses the **cost snapshot** stored on each SaleItem (`unitCost`) at sale time.
   - `Net Profit = Gross Profit − Expenses (incl. salaries)`.
   - Weighted-average cost on purchase: `newAvg = (oldQty*oldAvg + inQty*inCost) / (oldQty + inQty)`. Guard division by zero. Purchase returns reverse at the return's cost.
   - Receivables = Σ customer balances (+opening). Payables = Σ vendor balances. These must always equal the sum of their ledger entries — write an integrity check endpoint early (`GET /reports/integrity`) that verifies: ledger sums == cached balances, stock ledger sums == Product.stockQty, and every Sale's `grandTotal == subTotal − discount + tax + otherCharges` and `paidAmount + dueAmount == grandTotal`. Run it in tests.
2. **Money = Prisma Decimal, never JS floats.** Do arithmetic with decimal.js or Prisma Decimal; round money to 2dp, quantities to 3dp, at the edges only.
3. **Every financial write is ONE `prisma.$transaction`.** A completed sale atomically creates: Sale + SaleItems + StockMovements + Payment(s) + Product.stockQty update + Customer.balance update + Counter increment + AuditLog. Same discipline for purchases, returns, payments, salaries (salary payment auto-creates its Expense in the same transaction).
4. **StockMovement ledger is the source of truth**; `Product.stockQty` is a cache updated in the same transaction. Never mutate stockQty directly.
5. **Never hard-delete financial documents** (sales, purchases, payments). Use status CANCELLED or create return documents. Products/customers get `isActive=false` if referenced.
6. **Document numbers** come from the `Counter` table inside the transaction (INV-000123, PUR-, PAY-, EXP-, SAL-, EMP-, CUS-, VEN-, ADJ-).
7. **Validation twice**: zod on the client for UX, zod on the server for truth. Server returns `{ ok:false, error:{ code, message } }` with the standard codes in `docs/05-API-REFERENCE.md`.
8. **RBAC enforced on the server** with `requireRole()`; the client only hides UI. Roles: SUPER_ADMIN, ADMIN, MANAGER, CASHIER, ACCOUNTANT (matrix in `docs/04-FEATURES.md`; SUPER_ADMIN additionally owns global settings, business type, integrations/SMTP/WhatsApp, backups).
9. **Type-check before declaring done**: `npx tsc --noEmit` in both `apps/server` and `apps/web` must pass. Run the dev servers and hit the endpoints you built.
10. Small, focused files. No 1000-line route files — one module = one route file + one service file when logic grows.

## MCP servers — use them

The owner has MCP servers installed (design MCPs, codebase MCP, possibly others).
- **At the start of each session, list available MCP tools** and use them where they fit.
- **Design MCPs**: when building any new screen, consult/apply the design MCP output, but reconcile it with `docs/06-UI-DESIGN-SYSTEM.md` tokens (Forge dark / Daylight light, amber reserved for money-critical actions). MCP suggestions refine components; the token system keeps the app coherent. If the design MCP produces assets/components, adapt them to our CSS variables — never hardcode colors.
- **Codebase MCP**: use it to navigate/search the repo before editing, to avoid duplicating existing helpers.
- If an MCP is unavailable, proceed with the design system and note it.

## Design bar (premium, not template)

- Follow `docs/06-UI-DESIGN-SYSTEM.md` exactly: tokens, Archivo/Inter/JetBrains Mono, compact industrial density, dark/light switcher everywhere including auth pages.
- **Charts must feel premium**: Recharts with gradient area fills using `var(--accent)`, soft grid lines `var(--border)`, animated on mount, custom tooltips styled like our cards, empty/loading skeleton states. Dashboard: 30-day sales area chart, category share donut, top-products bar, receivables aging stacked bar. Never default Recharts colors.
- Every list: search + filters + skeletons + designed empty state. Every destructive action: named confirm dialog. Every save: toast with the document number.
- POS is full-screen, keyboard-first (F2 search · F4 qty · F7 discount · F9 payment · F10 complete · Esc void line).

## The build workflow (every module, same loop)

1. Announce the phase + module from `docs/01-BUILD-PLAN.md`. If schema changes are needed, update `schema.prisma` → `npx prisma migrate dev --name <change>`.
2. Server: routes + zod validation + transaction logic. Client: page + components + TanStack Query hooks.
3. Verify: tsc both apps, exercise the endpoints, click through the UI mentally (or with browser MCP if available).
4. Update `docs/08-CHECKLIST.md`.
5. **Git**: `git add -A && git commit -m "feat(<module>): <summary>"` then `git push`. One commit per module minimum. Never commit `.env` or `uploads/`.
6. Tell the owner what to test manually, in simple non-technical words, with example shop scenarios (e.g. "sell 5 cement bags to a credit customer, then check his ledger").

## Feature scope (v1 + v2 combined)

Everything in `docs/04-FEATURES.md` PLUS `docs/09-EXTENDED-FEATURES.md` PLUS
`docs/11-SCOPE-UPGRADES.md` Section A (A1 shop profile, A2 dynamic permission matrix,
A3 bulk import/export wizard, A4 drag-drop uploader, A5 definitive POS spec, A6 demo
data pack with P&L proof, A7 medical preset with batch/expiry FEFO) PLUS
`docs/12-GAP-CLOSURE.md` G1–G10 (accounts & transfers & balance sheet, brands,
service/combo product types, warranty, scanner/scale flags, HR extensions,
customer/vendor import, template editor, display-currency switcher, parity items).
**Hard requirement:** the price-volatility guarantee at the top of docs/12 —
snapshots rule all reports; past reports never change when prices change.
- Business Type presets (Building Materials, Kiryana/General Store, Electronics, Clothing, Pharmacy, Hardware, Custom) — seeds categories/units per type, selected in onboarding/Settings; core stays generic.
- Employees & Salaries (employee profiles with photos, monthly salary payment with bonus/deduction/advance, auto-Expense, one salary per employee per month).
- Expenses incl. Miscellaneous, rent, electricity, transport — all feeding P&L.
- Notifications: in-app bell (low stock, debt reminders, payables due, credit-limit breaches) + reminder rules.
- Messaging: WhatsApp on each sale/purchase (v1: wa.me deep links with prefilled receipt text + PDF share; v2: WhatsApp Cloud API) and SMTP email (nodemailer) — all sends logged in MessageLog. Configured by SUPER_ADMIN in Settings → Integrations.
- Built-in calculator widget (global hotkey, works inside POS).
- Shop branding: logo upload, invoice header/footer, terms — on all PDFs.
- Reports: every report has on-screen table + **PDF** + **Excel** download (pdfmake/exceljs, server-side).

## Definition of done (project)

Owner can run a full shop day end-to-end; every report matches manual math; `GET /reports/integrity` returns all-green; dark/light both flawless; then:
1. `npm run build` clean → deploy to VPS per `docs/07-DEPLOYMENT.md`.
2. **Build the Windows installer**: wire Electron prod mode (spawn built server, load built web, %APPDATA% uploads) → `npm run dist -w apps/desktop` → test `SoftGlaze-Stock-Manager-Setup.exe` on a clean machine.

## Session etiquette

- Start each session: `git status` + `git pull`, read the checklist, state what you'll do, then do it.
- If a request conflicts with the accounting rules above, explain the risk and propose the correct alternative — accuracy beats speed.
- Keep replies to the owner short and practical; he is a shop owner, not a programmer. Explain in plain language with shop examples.

## Grounding & session continuity rules

1. NEVER invent or assume file contents, APIs, schema fields, package versions, or
   settings. Before referencing or editing ANY file, read it first. Before using any
   function/model/route, confirm it exists with search (use the codebase MCP if
   available, otherwise grep).
2. Never claim something works until you have actually verified it: run `npx tsc
   --noEmit` in the app you changed, run the command, hit the endpoint, or load the
   page. If you cannot verify, say "unverified" explicitly.
3. If you are unsure about anything, check the file or ask me one short question.
   Saying "I don't know, let me check" is correct behavior. Guessing is a failure.
4. docs/ and prisma/schema.prisma are the source of truth. If your memory of the
   project conflicts with the files, the files win. Never restate the plan from
   memory — re-read it.
5. Work in small steps: one module or one fix at a time, verify, then continue.
   Never generate large amounts of code referencing things you haven't read.
6. Session continuity (models may switch mid-work due to usage limits): at the START
   of every session AND whenever you notice you may be resuming mid-task, run
   `git status && git log --oneline -5`, read CLAUDE.md and docs/08-CHECKLIST.md,
   and read SESSION-NOTES.md if it exists. After completing each module or stopping
   mid-task, update SESSION-NOTES.md with: what was just done, what is verified vs
   unverified, exact next step, and any known issues. Commit it with the code.
7. Only mark checklist items done after rule-2 verification passes.
