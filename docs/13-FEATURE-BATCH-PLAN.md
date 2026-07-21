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
- [x] **A4 Promise-to-pay tracking** — DONE (migration `a4_payment_promises`; Promises page + PROMISE_DUE bell; 12/12 checks). **Batch A complete except A5.**
- [ ] A5 Round-off setting — **next**
- [ ] B1 … (remaining, in the order above)
