# SoftGlaze — New Feature Batch Plan (post-F6)

The 36 features agreed with the owner (2026-07-20), sequenced into build batches.
Same rules as CLAUDE.md: accounting accuracy, Decimal money, single `$transaction`,
StockMovement/AccountEntry ledgers are source of truth, verify → commit → push per module.
These are all **new**, beyond the existing `docs/10` roadmap (F7–F18).

Effort key: **S** ≈ half-day · **M** ≈ 1–2 days · **L** ≈ 3+ days.
🔌 = needs owner input / external credentials before it can finish.

---

## Batch A — Money & expense accuracy (start here)
| # | Feature | Effort | Notes |
|---|---|---|---|
| A1 | **Recurring expenses auto-post** | S | Rent/electricity/etc. auto-create monthly as real Expenses (reuses expense→account posting). **← building first.** |
| A2 | **Categorised stock-adjustment reasons** | S | Breakage/sample/theft/wastage on adjustments + report. |
| A3 | **Comparative reports (MoM / YoY)** | S | Prev-period + same-month-last-year columns on existing reports. No schema change. |
| A4 | **Promise-to-pay tracking** | S | On receivables aging: log a promised date + follow-up alert. |
| A5 | **Round-off setting** | S | Round POS grand total to nearest ₨5/10; diff posts to a "Round-off" account. |

## Batch B — Daily till & cash control
| # | Feature | Effort | Notes |
|---|---|---|---|
| B1 | **Cash denomination counter** | S | Note-count grid → drawer total. |
| B2 | **Day-close / Shift Z-report** | M | Reconcile counted cash vs cash-account balance; day cash breakdown; PDF. |

## Batch C — Building-materials power tools ★
| # | Feature | Effort | Notes |
|---|---|---|---|
| C1 | **Rod/sheet weight & length calculator** | M | Sell sariya by ft/kg/ton with auto weight×rate; per-mm weight table. |
| C2 | **Landed-cost allocation** | M | Distribute freight/duty across purchase items into unit cost (accounting-sensitive). |
| C3 | **Contractor rate contracts** | M | Agreed per-item rates valid for a date range, auto-applied in POS. |
| C4 | **Site-wise customer sub-ledgers** | M | One contractor, multiple sites, separate udhaar per site. |
| C5 | **Vehicle/trip & freight billing** | M | Log delivery trips (driver/vehicle) + freight recovered. |
| C6 | **Rod/pipe cutting & offcut tracking** | L | Cut lengths, leftover offcuts back into stock. |

## Batch D — Inventory & purchasing
| # | Feature | Effort | Notes |
|---|---|---|---|
| D1 | **Cost/price history + trend** | S | Track buy-price changes over time per product. |
| D2 | **Negative-stock / backorder setting** | S | Optionally allow overselling with a backorder flag. |
| D3 | **Barcode / shelf-label designer & print** | M | Print price+barcode labels (barcodes already stored). |
| D4 | **Vendor debit/credit notes** | M | Formal documents for returns & rate corrections. |
| D5 | **Purchase Orders → GRN flow** | L | Raise PO → receive against it → bill; partial receipts. |

## Batch E — Customer engagement & messaging
| # | Feature | Effort | Notes |
|---|---|---|---|
| E1 | **Auto-emailed monthly statements** | S | Ledger PDF to each customer monthly (reuses SMTP). |
| E2 | **Local SMS gateway** | S | 🔌 Wire a Pakistani SMS provider into the existing message interface. |
| E3 | **Eid/festival bulk greetings** | S | Goodwill WhatsApp/SMS blast to customer list. |
| E4 | **Tiered udhaar reminder escalation** | M | Auto reminder ladder as debt ages. |

## Batch F — HR & staff
| # | Feature | Effort | Notes |
|---|---|---|---|
| F1 | **Payslip PDF** | S | From existing salary data. |
| F2 | **Biometric attendance import** | S | CSV from fingerprint machine → Attendance. |
| F3 | **Salesman commission** | M | Auto-calc commission per rep from their sales. |

## Batch G — POS experience
| # | Feature | Effort | Notes |
|---|---|---|---|
| G1 | **Quick-sale favourites grid** | S | Hotkey tiles for top products. |
| G2 | **Walk-in return (no invoice)** | S | Refund/exchange without original bill. |
| G3 | **Discount approval workflow** | M | Cashier requests over-limit discount → manager approves (RBAC). |
| G4 | **Loyalty points / rewards** | M | Points on purchases, redeem as discount. |
| G5 | **Customer display / 2nd screen** | M | Running total shown to customer. |

## Batch H — Platform & safety
| # | Feature | Effort | Notes |
|---|---|---|---|
| H1 | **Offsite auto-backup (Google Drive/S3)** | S | 🔌 Auto-upload the JSON backup nightly. Needs cloud creds. |
| H2 | **Comparative-dashboard / saved report filters** | S | Persist filter presets per user. |
| H3 | **2FA for owner/admin** | M | TOTP on login for privileged roles. |
| H4 | **Import-purchase FX capture** | M | Buy in USD/AED, record rate; books stay PKR. |
| H5 | **Sales-tax / GST register (FBR-style)** | M | Tax register + report for registered shops. |
| H6 | **Bank reconciliation** | L | Import bank statement, match to account entries. |
| H7 | **Offline POS mode** | L | Queue sales offline, sync later. |

---

## Working method (per feature)
1. Announce the feature; design schema change → `prisma migrate dev --name <change>`.
2. Server: routes + zod + `$transaction` where money moves. Reuse proven helpers
   (`postPayment`/`postToAccount`, `applyMovement`, `nextNumber`).
3. Web: page/section + TanStack Query hooks + reports (PDF/Excel where relevant).
4. Verify: `tsc --noEmit` both apps + exercise endpoints + `/reports/integrity` all-green.
5. Update `docs/08-CHECKLIST.md`, commit `feat(<feature>): …`, push.

## Status
- [x] **A1 Recurring expenses** — DONE (migration `20260720193103_a1_recurring_expenses`; 12/12 checks; commit `ce1511c`).
- [x] **A2 Categorised stock-adjustment reasons** — DONE (migration `20260720232459_a2_adjustment_reasons`; 11/11 checks; balance sheet ₨0).
- [x] **A3 Comparative reports (MoM / YoY)** — DONE (no schema change; new `/reports/comparison`; 10/10 checks).
- [x] **A4 Promise-to-pay tracking** — DONE (migration `a4_payment_promises`; Promises page + PROMISE_DUE bell; 12/12 checks).
- [x] **A5 Round-off setting** — DONE (migration `a5_sale_roundoff`; `Sale.roundOff` folds into grandTotal; integrity invariant updated; 13/13 checks). **✅ Batch A COMPLETE.**
- [x] **B1 Cash denomination counter** + **B2 Day-close / Z-report** — DONE as one module (migration `b_day_close`; `DayClose` model + Day Close page + 80mm Z-report; 11/11 checks; posts nothing → integrity-safe).
- [x] **C1 Rod/sheet weight & length calculator** — DONE (migration `c1_weight_calc`; `WeightCalc` enum + Product weight-profile fields; `lib/weight.ts` pure math + `POST /tools/weight-calc`; POS ⚖ line button + standalone Weight Calc page + Products weight-profile section; 22/22 checks; pure calculator → zero accounting effect; 4 real-DB sariya products profiled for testing).
- [x] **C2 Landed-cost allocation** — DONE (migration `c2_landed_cost`; `PurchaseItem.landedUnitCost` + `Purchase.landedBasis`). Freight/duty (otherCharges) is spread across items by value or quantity and capitalised into `landedUnitCost` → weighted-avg cost + StockMovement, so inventory value & COGS reflect the true landed cost. Document math (subTotal/grandTotal) untouched; basis NONE keeps the old "expense it" behaviour. Balance sheet's `inventoryValueAdded` now uses landedUnitCost; purchase returns unchanged (the `revaluation` term auto-recognises freight-on-returned-goods as a loss). 25/25 checks — integrity all-green + balance sheet ₨0 through purchase (value/qty/none), sale (COGS=landed), and partial return.
- [x] **C3 Contractor rate contracts** — DONE (migration `c3_rate_contracts`; `RateContract` + `RateContractItem`). A customer's agreed per-item rates for a date range auto-fill the POS line (later contract wins; `GET /rate-contracts/rates/:customerId` resolves today's rates). New Rate Contracts page (People nav) + POS auto-apply (reprices non-edited lines on customer change, "contract" line tag + banner). Pure pre-fill like price groups — the sale snapshots the posted unitPrice, so editing/expiring never changes past bills → zero accounting effect. 20/20 checks (date resolution, override precedence, expired/upcoming/inactive ignored, snapshot proof, integrity all-green + BS ₨0).
- [x] **C4 Site-wise customer sub-ledgers** — DONE (migration `c4_customer_sites`; `CustomerSite` + `Sale.siteId` + `Payment.siteId`). One contractor, many sites/projects: each sale (POS) and receipt can be tagged to a site, and per-site udhaar is tracked. **Balances are DERIVED** (the customer-ledger math filtered by site tag), so `Σ(site balances) + unassigned == the customer's single balance` by construction — no cached per-site balance, no new invariant, integrity untouched. `GET /customer-sites` (balances) + `/:id/ledger` (per-site statement). Web: Sites manager on the customer (balances + statement), POS site picker, receive-payment site picker. 24/24 checks — per-site balances, reconciliation through tagged sales/receipts/returns/opening-balance, cross-customer rejection, integrity all-green + BS ₨0 throughout.
- [x] **C5 Vehicle/trip & freight billing** — DONE (migration `c5_delivery_trips`; `DeliveryTrip` + `DeliveryNote.tripId`). Log a vehicle run (driver/vehicle), attach the challans it carried, and record freight charged (recovered) vs freight paid (to the transporter). **`freightPaid` optionally posts a real Expense** (money out + P&L, category "Transport & Loading", via the proven expense path) and is **reversed on delete**; **`freightCharged` is record-only** (real recovery already sits on invoices as otherCharges → no double-count) driving the delivery-margin view. So the only accounting effect is the optional freight expense; integrity untouched. New Delivery Trips page (Sell nav, margin totals). 23/23 checks — freight expense posts + reverses, margin, record-only trip, challan attach, integrity all-green + BS ₨0 throughout.
- [ ] C6 Rod/pipe cutting & offcut tracking — **next** (last of Batch C)
