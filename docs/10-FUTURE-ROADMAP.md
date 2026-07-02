# SoftGlaze — Future Roadmap (post-Phase-9 features)

Build these ONLY after docs/01 Phases 1–9 are complete and the shop has run on the
system for a few weeks. Same rules as CLAUDE.md apply: accounting accuracy, Decimal
money, single transactions, ledger as source of truth, verify before done.
Each feature below = schema change (if any) + API + UI + reports + checklist entry.

---

## TIER 1 — Highest impact for a building materials business (build first)

### F1. Post-dated cheque management ⭐
Why: large share of B2B payments in Pakistan are cheques; bounces cause real losses.
- Schema: `Cheque` model — direction (RECEIVED/ISSUED), customerId/vendorId, bank,
  chequeNo, amount, chequeDate (due), status (PENDING/DEPOSITED/CLEARED/BOUNCED/REPLACED),
  linked Payment id, notes.
- Flow: receiving a cheque creates a PENDING payment that does NOT count as cleared cash;
  on CLEARED it finalizes; on BOUNCED it auto-reverses the customer payment in his ledger
  (+ optional bounce charges) and fires a notification + WhatsApp reminder.
- UI: Cheque register screen (due today/this week tabs), due-date alerts in the bell,
  cheque status on customer ledger lines. Reports: cheques in hand, bounced history.

### F2. Delivery challans & dispatch
Why: materials ship by truck, often in multiple partial deliveries per invoice.
- Schema: `DeliveryNote` (challan no CHL-0001, saleId, date, driverName, vehicleNo,
  receiverName/sign, status) + `DeliveryNoteItem` (saleItemId, qtyDelivered).
- Rules: Σ delivered qty per item ≤ sold qty; invoice shows Delivered/Pending badges.
- UI: "Dispatch" from a sale → pick items+qty → print challan (A4, no prices option).
  Pending deliveries report by customer/product. Stock can optionally deduct at
  dispatch instead of at invoice (setting: `stock_deduct_on = invoice|delivery`).

### F3. Advance bookings with rate lock
Why: customers book cement/sariya at today's rate with an advance; deliver over weeks.
- Schema: `Booking` (BKG-0001, customer, items with locked unitPrice, advance received,
  status OPEN/PARTIAL/COMPLETED/CANCELLED, validUntil) + link to generated invoices.
- Flow: booking takes advance Payment (liability, not revenue — revenue only on invoice);
  each delivery converts booked qty → invoice at the locked rate, consuming the advance
  first. Cancel = refund or credit note. Reports: open bookings, advances held.
- Accounting note: advances held are a liability line on the dashboard, never profit.

### F4. Construction material estimator (sales weapon)
Why: converts "I'm building X" walk-ins into quotations instantly.
- Config-driven formulas per structure type (slab sqft, wall sqft, marla house presets):
  cement bags, sariya kg by mm, bricks, sand/crush cft — coefficients editable by
  SUPER_ADMIN (rates differ by region/engineer).
- UI: Estimator page → inputs (area, floors, type) → material list with live prices
  from Products → one click = Quotation (Phase 3 module) → later converts to invoice.

### F5. Attendance + salary advances
- Schema: `Attendance` (employeeId, date, status P/A/L/HALF, unique per day) and
  `EmployeeAdvance` (amount, date, recoveredIn SalaryPayment link).
- Salary payment screen auto-shows: absents (optional per-day deduction), open advances
  (auto-fill deduction). Monthly attendance sheet report (PDF).

---

## TIER 2 — Money control & scale

### F6. Customer price groups
`PriceGroup` (Retail/Contractor/Dealer/custom) with per-product overrides or % off;
Customer.priceGroupId; POS auto-applies; report: margins by price group.

### F7. Multi-godown / warehouse
`Location` model; StockMovement + Product stock become per-location (ProductStock
join table); transfer document TRF-0001 (out one, in other, atomic); POS sells from a
selected location; stock reports per location. Touches many queries — schedule carefully.

### F8. Stocktake (physical count) mode
Guided count session: snapshot expected qty → enter counted → variance report (qty & ₨)
→ one-click adjustment batch with reason "Stocktake YYYY-MM-DD" + who counted.

### F9. Installment (qist) sales
`InstallmentPlan` on a sale: down payment, n monthly installments, schedule rows with
due dates; receipts allocate to installments; overdue feeds notifications + WhatsApp
reminder template; report: collections due this month, overdue book.

### F10. Reorder intelligence + dead stock
Sales velocity per product (last 30/90 days) → days-of-stock-left → "Reorder now" list
with suggested qty (lead time setting). Dead stock report: no sales in X days, ₨ value
sitting. Both as dashboard widgets + PDF/Excel.

### F11. Owner's daily digest
Cron at closing time: sales, profit, cash in hand, recoveries, new udhaar, low stock →
WhatsApp (walink can't auto-send; use Cloud API when enabled, else email via SMTP).

---

## TIER 3 — Product & platform growth

### F12. Multi-branch
Branch model + per-branch stock (builds on F7), branch on every document, consolidated
vs per-branch reports, inter-branch transfer with in-transit status, user↔branch scoping.

### F13. Multi-tenant SaaS mode
Tenant (shop) table + shopId on all tables (mechanical change, planned for), signup +
onboarding with business presets, subscription plans + manual/JazzCash billing first,
tenant isolation tests, super-owner console (you) with tenant usage stats.
Precondition: your own shop stable on the system + F12 experience.

### F14. Customer self-service portal
Read-only portal: customer logs in via phone + OTP (or code you give), sees own ledger,
invoices (PDF), booking status. Separate limited API surface; big trust builder.

### F15. Urdu / i18n
react-i18next; translate UI strings; RTL-safe layout audit; per-user language setting;
Urdu line on invoices already supported via footer — extend to full labels.

### F16. In-app AI assistant
Anthropic API endpoint on server: natural-language questions answered from real data via
safe, read-only report queries ("which category made most profit this month?").
Guardrails: read-only, role-respecting, never invents numbers — answers only from query
results. Also: anomaly notes ("expenses 40% above monthly average").

### F17. Preset deepeners (when selling to other verticals)
Serial-number tracking (electronics), batch + expiry with FEFO alerts (pharmacy),
size/color variants (clothing). Each ships with its business preset.

### F18. PWA + phone niceties
Installable PWA (manifest + service worker, cached shell), camera barcode scanning
(getUserMedia) for stocktake and POS on tablets/phones.

---

## Suggested order
F1 → F2 → F3 → F5 → F4 → F6 → F10 → F8 → F11 → F9 → F7 → F15 → F12 → F14 → F16 → F13 → F17/F18

## Prompt to use later (per feature)
"Read docs/10-FUTURE-ROADMAP.md feature F<N> and CLAUDE.md. Design the schema change,
show me the migration plan and screens list for approval, then build it with the same
verify-commit-push loop, including its reports and checklist entries."
