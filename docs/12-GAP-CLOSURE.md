# SoftGlaze — Gap Closure & Competitor Parity (docs/12-GAP-CLOSURE.md)

Source: comparison against a commercial POS feature list (Stocky-class products).
We already exceed it in: permission matrix, integrity-proven P&L, price-snapshot
accounting, cheques, challans, rate-lock bookings, estimator, batch/expiry FEFO,
demo-data P&L proof, offline desktop + server duality.
This doc specs what we were MISSING. All CLAUDE.md rules apply.

## PRICE-VOLATILITY GUARANTEE (restated as a hard requirement)
Pakistani market reality: prices change hourly/daily. The system MUST behave as:
- Every SaleItem/PurchaseItem stores its own unitPrice + unitCost snapshot. Reports
  read snapshots only — editing a product's prices NEVER changes any past report.
- Weighted-average cost updates only from purchases; manual cost edit (permission
  `products.edit_cost`, audit-logged) affects only future sales + current valuation.
- Returns reverse at the ORIGINAL document's snapshot values.
- Acceptance test (add to A6 demo verification): sell @600/cost500 → change product
  to 850/700 → sell again → day profit must equal exactly 100+150=250; prior-day
  reports byte-identical before/after the price edit.

---

## G1. Accounts & Fund Transfers (Phase 4) ⭐ biggest gap
Upgrade PaymentMethod into real money accounts:
- Schema: extend `PaymentMethod` → `Account` semantics: openingBalance, currentBalance
  (cached; every Payment updates it in-transaction), accountNo/bank fields, isCash.
- New `FundTransfer` (TRN-0001): fromAccountId, toAccountId, amount, date, notes —
  e.g. shop cash → Meezan Bank deposit; creates paired ledger entries atomically.
- Deposits/withdrawals: owner capital in, owner drawings out (affects balance sheet,
  NOT P&L — drawings are not expenses).
- Screens: Accounts list with live balances, account statement (ledger per account),
  Transfer form, Deposit/Drawing form.
- Reports: per-account statement PDF/Excel; **Balance Sheet** — Assets (cash+bank
  balances, stock valuation at cost, receivables) vs Liabilities (payables, advances
  held from bookings) vs Equity (capital + retained profit − drawings). Must balance;
  add its check to /reports/integrity.
- Day-close now reconciles per account, not just cash.

## G2. Brands (Phase 1, tiny)
`Brand` model (name, image, isActive) + optional Product.brandId; POS/product filters
by brand; reports: sales by brand; import wizard maps a brand column (auto-create).

## G3. Product Types: Service, Combo, Variants (Phase 1–2)
- `Product.type = STANDARD | SERVICE | COMBO` (+ VARIANT via F17 when needed).
- SERVICE: no stock tracking (delivery charges as line item, cutting/loading fees,
  repair labor) — skips StockMovement, still hits revenue/P&L correctly.
- COMBO/bundle: `ComboItem` (comboProductId, componentProductId, qty). Selling a combo
  deducts component stock; combo cost = Σ component snapshot costs (profit stays true).
- Variants: keep as F17 (clothing preset) — note here for completeness.

## G4. Warranty & Guarantee (Phase 3, small)
- Product: warrantyMonths, guaranteeMonths (0 = none).
- SaleItem: warrantyUntil/guaranteeUntil auto-computed at sale; printed on invoice.
- Report: sold items under active warranty (customer, invoice, item, days left);
  POS return flow shows warranty status when an invoice is pulled up.

## G5. Weighing Scale + Camera Scanner (Phase 3 optional flag)
- Camera scanner: pull F18's camera barcode scanning forward as a POS setting
  (getUserMedia + a JS barcode lib) — works on tablet/phone browsers.
- Digital scale: Electron mode reads serial/USB scales (common protocols; configurable
  port/baud in Settings → Devices). POS qty field gets a "read from scale" button +
  auto-capture toggle for weight-priced products (`Product.isWeighed`). Browser mode:
  WebSerial where available, else manual entry. Feature-flagged; skip hardware we
  can't test until the owner has the device.

## G6. HR Extensions (Phase 4, lightweight — not a full HRIS)
- `Department` master; Employee.departmentId; designation stays text or small master.
- `Shift` (name, start, end) + Employee.shiftId; attendance screen shows late arrivals
  vs shift start (informational).
- `LeaveRequest` (employee, from, to, type PAID/UNPAID/SICK, status, approver) —
  approved unpaid leave auto-suggests salary deduction days in the pay screen.
- `Holiday` (date, name) — attendance sweep skips holidays; Fridays/Sundays configurable
  weekly off. Keep all of this simple: one screen each, no over-engineering.

## G7. Import Wizard Extension (Phase 1 with A3)
- Same 4-step wizard, new targets: **Customers** and **Vendors** (CSV/Excel/paste;
  map name*, phone, address, tax no, opening balance, credit limit; dedupe by phone).
- Opening balances create proper opening ledger entries.
- Purchases/sales history import stays in F32 (migration kit) — it needs ledger care.

## G8. Message Template Editor (Phase 6 with integrations)
- Settings → Templates: editable templates with placeholder chips ({shop}, {customer},
  {invoice_no}, {total}, {paid}, {due}, {date}, {items_count}) for: sale receipt,
  purchase confirmation, debt reminder, quotation, statement — per channel
  (WhatsApp text / Email subject+HTML body). Live preview with sample data.
- Default set seeded; "reset to default" per template.
- Optional SMS channel: pluggable gateway interface (Pakistani providers/branded SMS
  via HTTP APIs) — implement the interface + MessageLog channel SMS, ship disabled
  until the owner picks a provider.

## G9. Currency — pragmatic multi-currency (Phase 6, display-level)
Books remain SINGLE base currency (PKR) — this is what keeps P&L incorruptible.
- Settings: base currency (locked after first transaction), display currencies list
  (USD, AED, …) with manual exchange rates (editable anytime, rate history kept).
- UI: a currency switcher in the header converts DISPLAYED amounts (dashboard, reports)
  at the current rate, clearly marked "≈ converted view"; documents always store PKR.
- Optional on purchases: enter a foreign amount + rate → converts to PKR at entry and
  stores both (for import deals). No foreign-currency ledgers in v1.

## G10. Small parity items (sprinkle into their phases)
- Product dimensions (L×W×H + weight) fields; show on detail, optional on invoice.
- Favicon + browser page title in Settings → Branding (A1).
- Inventory valuation report: add "at sale price" variant beside "at cost".
- Sales by payment method report; error-log viewer for SUPER_ADMIN (server log tail).
- Recurring invoices: LOW priority — `RecurringInvoice` (template sale, interval,
  next run) generating drafts via the cron; build only if the owner actually needs it.
- Export any table: ensure every list screen's toolbar has PDF/Excel (already a rule).

## Deliberately EXCLUDED (decision, not oversight)
- Projects & tasks module — project-management bloat inside shop software; a shop
  doesn't run sprints. Revisit never, unless the owner demands it.
- 24-language pack — we ship English + Urdu done well (F15); i18n framework makes more
  languages possible later without a marketing-number arms race.
- WooCommerce/online store sync — not v1; future online catalog + customer portal
  (F14) is our path if the owner wants online presence.
- SMS-first notifications — WhatsApp-first for Pakistan; SMS optional via G8 gateway.

## Phase placement summary
| Item | Phase |
|---|---|
| G2 Brands, G3 service/combo types, G7 customer/vendor import, G10 dimensions/favicon | 1 |
| G3 combo stock logic | 2 |
| G4 warranty, G5 scanner/scale flags | 3 |
| G1 Accounts, transfers, balance sheet, G6 HR extensions | 4 |
| G10 report variants | 5 |
| G8 template editor (+optional SMS), G9 currency switcher | 6 |
| Price-volatility acceptance test | end of 3 (with A6), re-run in 5 |

## Prompt line for Claude Code (paste between phases, no need to interrupt current work)
"Read docs/12-GAP-CLOSURE.md. Merge G1–G10 into their phases: update CLAUDE.md scope,
docs/08-CHECKLIST.md and any affected module before building it. The price-volatility
guarantee at the top is a hard requirement — add its acceptance test to the demo-data
verification. Commit and push, then continue."
