# SESSION-NOTES.md

> Living hand-off file. Updated after every module or mid-task stop.
> Read this at the start of every session (see CLAUDE.md → Grounding & session continuity rules).

## New feature batch started — A1 Recurring Expenses DONE ✅ (2026-07-21)

Owner approved a 36-feature batch (`docs/13-FEATURE-BATCH-PLAN.md`, beyond docs/10 F7–F18) and said "start". Building in batch order, verify→commit→push per feature.

**A1 — Recurring expenses (DONE).** Fixed monthly costs (rent/electricity/…) auto-post as REAL Expenses (money out of their account + P&L hit) through the SAME `postPayment` path as a manual expense, so accounting is identical and integrity stays green.
- Schema: `RecurringExpense` model (categoryId, methodId, amount, dayOfMonth 1–28, notes, isActive, `lastPostedPeriod` "YYYY-MM" dedupe guard) + `Expense.recurringId` (onDelete SetNull) + back-relations. Migration `20260720193103_a1_recurring_expenses`.
- Server: `lib/recurring.ts` `runRecurringExpenses(actorUserId?)` — posts each active rule once, on/after `dayOfMonth`, deduped by month; own `$transaction` per rule; cron attributes to oldest SUPER_ADMIN. Wired into `index.ts` (on boot + daily sweep). Routes in `expenses.routes.ts`: `GET/POST /expenses/recurring`, `PATCH/DELETE /expenses/recurring/:id`, `POST /expenses/recurring/run` ("Run due now"). Defined before the generic `/:id` routes.
- Web: `Expenses.tsx` → new **Recurring** header button opening a manager modal (add/edit/pause/delete rules + "Run due now"); auto-posted expense rows show an "Auto" badge. `RecurringExpense` type added.
- **Verified (throwaway `softglaze_e2e`, dropped; real DB untouched):** 12/12 — day-of-month gate (day-28 rule NOT posted on the 21st), one-click run posts exactly the due rule, dedup (2nd run posts 0), cash account fell by the amount, P&L expense = ₨25,000, integrity all-green + balance sheet ₨0. Both apps `tsc --noEmit` clean. Real dev DB migrated (additive; empty table + nullable column — no integrity impact).

**A2 — Categorised stock-adjustment reasons (DONE).** Adjustments now carry a structured `reasonCode` (`AdjustmentReason` enum: COUNT_CORRECTION/BREAKAGE/THEFT/SAMPLE/WASTAGE/EXPIRY/FOUND/OTHER) alongside the free-text `reason` (now an optional detail). Loss reasons (BREAKAGE/THEFT/WASTAGE/EXPIRY) type outward moves as DAMAGE; the per-line "damage" checkbox is gone (reason drives it). New **Adjustments by Reason** report (`GET /reports/adjustments-by-reason`) — shrinkage/write-off: qty in/out + loss value at the movement's snapshot cost, grouped by reason (PDF/Excel). Migration `20260720232459_a2_adjustment_reasons`. Web: Stock New-Adjustment form reason dropdown + optional detail; Reports nav entry (PackageMinus, gated `stock.adjust`); `StockAdjustment.reasonCode` type.
- **Accounting checked:** stock write-offs already balance — `computeBalanceSheet` recognises `adjustmentValue = Σ(ADJUSTMENT_IN/OUT/DAMAGE qty×unitCost)` in retained earnings, so a breakage loss reduces equity and Assets=Liab+Equity holds. A2's ADJUSTMENT_OUT→DAMAGE retype stays inside that same set → no balance-sheet change.
- **Verified (throwaway DB, dropped):** 11/11 — breakage loss ₨3,500, sample ₨1,400, total loss ₨4,900, stock nets 100→96, integrity all-green + **balance sheet ₨0**. Both apps tsc clean.

**A3 — Comparative reports (MoM / YoY) (DONE).** New `GET /reports/comparison?from&to` — this period vs the immediately-preceding equal-length window vs the same dates last year, with % change, for Net sales / COGS / Gross profit / Expenses / Net profit (net profit is the totals row). No schema change: a shared `plMetrics(from,to)` helper reuses the accrual P&L math; the "vs prev / vs LY" columns are plain-string % cells ("+12.5%" / "—" / "new") which the exporter renders fine in table/PDF/Excel. Web: one registry line in `Reports.tsx` (BarChart3, gated `reports.profit`) — the generic ReportView renders it. **Verified (throwaway DB, dropped):** 10/10 — backdated sales into each window gave current ₨10,000 / prev ₨5,000 (+100%) / last-year ₨8,000 (+25%), net-profit row 3,000/1,500/2,400, integrity green. Both apps tsc clean.

**A4 — Promise-to-pay tracking (DONE).** Soft collections record: a customer promised ₨X by a date. NO money moves (their udhaar already lives on the ledger); this only tracks the commitment + outcome. `PaymentPromise` model (customer, amount, promiseDate, note, status OPEN/KEPT/BROKEN/CANCELLED, userId) + `PromiseStatus` enum + `NotificationType.PROMISE_DUE`. Routes `promises.routes.ts` (`GET /promises` [+`?status=overdue`], `/summary`, POST, PATCH status/edit, DELETE) mounted `/api/v1/promises`; gated `customers.view` (read) / `payments.receive` (write). Daily sweep (`lib/notify.runSweep`) raises a PROMISE_DUE bell for OPEN promises past their date (deduped by promise id); resolving/deleting marks the bell read. Web: new **Promises** page (summary cards, status filters, log-promise modal with customer search, Kept/Broken/Cancel/Delete row actions) + nav (HandCoins) + route + `PaymentPromise`/`PromiseSummary` types + PROMISE_DUE icon in bell/notifications. Migration `20260720…_a4_payment_promises`.
- **Verified (throwaway DB, dropped):** 12/12 — 2 promises, summary open 2 / overdue 1 / ₨8,000, overdue filter, `POST /notifications/sweep` raised exactly 1 PROMISE_DUE at the overdue promise, mark-KEPT dropped summary + cleared the bell (0 unread), integrity all-green. Both apps tsc clean.

**Batch A: A1–A4 done, A5 (round-off) remains. Commits: F6 3bbc607 · A1 ce1511c · A2 ddc6595 · A3 04f20ac · A4 next.**

**A5 — Round-off (DONE). ✅ Batch A complete.** Round the POS grand total to the nearest ₨1/5/10 (Settings → Shop Profile "Round off total to"; setting `round_off_to`, default "0"=off). Design decision: instead of a separate round-off account, the difference is stored as `Sale.roundOff` and **folds into grandTotal**, so it naturally flows into revenue/profit and the books stay balanced. The sacred integrity invariant was updated: `grandTotal == subTotal − discount + tax + otherCharges + roundOff` (reports.routes sale-total check now selects+adds roundOff). Server (`sales.routes`) reads the setting, rounds `rawTotal`→`grandTotal`, stores `roundOff` on both completed + draft/quotation sales. POS recomputes the same rounding client-side (reads `round_off_to` from GET /settings) → shows a "Round off" line + rounded **payable**, and default cash / due / change all use payable. Receipt prints the round-off line. `Sale.roundOff` schema field + web Sale type. Migration `20260721…_a5_sale_roundoff` (additive; real DB migrated, integrity still ₨0). Seeded `round_off_to:"0"` + added to EDITABLE_KEYS; ensured the key exists on the real DB (INSERT ON CONFLICT).
- **Verified (throwaway DB, round_off_to=10, dropped):** 13/13 — round up 2997→3000 (+3), round down 2002→2000 (−2), profit incl. round-off, P&L revenue 5000, sale-totals integrity check passes, **all-green + balance sheet ₨0**. Both apps tsc clean.

**Also this session (owner testing):** sidebar regrouped into sections (Sell/Inventory/People/Money/Insights/Admin) — commit `f48bb38`. Loaded 15 realistic building-materials products with opening stock into the **real DB** via the API (cement/sariya/bricks/pipes/sand/paint/hardware/sanitary) so the owner can test POS+print; real DB integrity still all-green ₨0. Set a **temporary password** on `admin@softglaze.com` → `softglaze123` (owner to change in-app) so they could log in; dev servers (`npm run dev`) left running on :4000 (API) + :5173 (web).

**Batch A commits: F6 3bbc607 · A1 ce1511c · A2 ddc6595 · A3 04f20ac · A4 509b5d2 · menu f48bb38 · A5 next.**

**B1+B2 — Day close (cash counter + Z-report) (DONE).** End-of-day drawer reconciliation. Count the cash by PKR denomination (5000…1) → `countedCash`; the system computes `expectedCash` = Σ cash-account (`isCash`) currentBalance, `variance` = counted − expected (over/short), plus the day's `cashIn`/`cashOut` from cash-account Payments (informational). **Posts NOTHING to the ledgers** — pure record + audit, so integrity is never touched (this was the design choice; over/short is a finding for the owner). `DayClose` model (refNo DCL-, businessDate, openingFloat, expected/counted/variance, cashIn/out, denominations JSON, notes) + User back-relation. `day-close.routes.ts` (`GET /` list, `GET /preview?date=`, `POST /`, `GET /:id`) mounted `/api/v1/day-close`; gated `accounts.view`. Web: **Day Close** page (Money nav, Coins icon) — denomination count grid with live line/counted totals, expected-vs-counted variance banner, history table, printable **80mm Z-report** (`printZReport`, client-side print window). `DayClose`/`DayClosePreview` types. Migration `20260721…_b_day_close`.
- **Verified (throwaway DB, dropped):** 11/11 — after a ₨5,000 cash sale + ₨500 cash expense: preview expected ₨4,500 / in ₨5,000 / out ₨500; count 4500 → variance 0; count 4450 → variance −50; DCL numbering; integrity all-green. Both apps tsc clean.

**Also:** POS product panel now lists the full active catalog by default (search filters it) instead of blank-until-search — commit `13e0a9e`.

**Commits: … A5 c0266e2 · POS 13e0a9e · day-close 0d9df3e. Batch B done.**

**C1 — Rod/sheet weight & length calculator (DONE). ✅ Batch C started.** Sell steel by piece/length but price by weight — the calculator turns diameter/thickness × length (or pieces × standard length) into kg/ton so staff stop doing the math by hand. **Pure calculator: it writes NOTHING to the ledgers — it only fills a sale-line's qty — so it has zero accounting effect and integrity is untouched.**
- Schema: `WeightCalc` enum (NONE/ROD/SHEET) + Product profile fields `diameterMm`/`thicknessMm`/`sheetWidthFt`/`pieceLengthFt`/`densityKgM3` (all nullable; density null → steel 7850). Migration `20260721043746_c1_weight_calc` (additive; real DB migrated, integrity still ₨0).
- Server: `lib/weight.ts` pure math — ROD `weight = π/4·(d_m)²·L·ρ` (steel kg/m ≈ d²/162.28), SHEET `L·W·t·ρ`, `qtyForUnit()` maps the result onto the product's unit (kg/ton/ft/pcs/sqft, else kg-with-flag). `tools.routes.ts` → `POST /api/v1/tools/weight-calc` (stateless, requireAuth). `products.routes` create/update now accept+persist the profile.
- Web: `lib/weight.ts` client mirror (instant UI); `WeightCalcPanel` reusable component (rod/sheet toggle, live breakdown, optional "set line qty" action); **POS** ⚖ button on weight-profiled cart lines → modal → applies qty; standalone **Weight Calc** page (Inventory nav, Scale icon) with product-prefill search; Products form "Weight profile" section; `WeightCalc`/`WeightCalcResult` types + Product fields.
- **Verified (throwaway DB `softglaze_e2e`, dropped):** 22/22 — profile persists on create; ROD 12mm×10pc×40ft = 108.24 kg (0.2706 kg/ft, 0.1082 t); lengthFt overrides pieces; SHEET 3mm 4ft×8ft = 70.01 kg / 32 sqft; density 2700 scales; validation rejects ROD w/o diameter; unknown unit → assumedKg; integrity all-green + balance sheet ₨0. Both apps tsc clean.
- **Real DB:** PATCHed 4 sariya products (12/16/20mm + sample) to ROD ⌀ + 40ft/pc so the ⚖ button is testable live; integrity still all-green ₨0.

**C2 — Landed-cost allocation (DONE).** Freight/duty/loading on a purchase (`otherCharges`) is now spread across the items and **capitalised into each item's cost** instead of being expensed immediately, so inventory value and COGS reflect the TRUE landed cost (e.g. sariya that costs ₨285 billed + ₨5 freight = ₨290 landed → thinner real margin).
- Schema: `PurchaseItem.landedUnitCost` (billed + allocated freight; null = no allocation) + `Purchase.landedBasis` ("NONE"|"VALUE"|"QTY"). Migration `20260721060509_c2_landed_cost` (additive; real DB migrated, integrity still ₨0).
- Server (`purchases.routes` POST): allocate `otherCharges` by line value or by quantity (last line takes the rounding remainder → Σ = otherCharges exactly); `landedUnit[i]` = billed + share ÷ qty drives the **weighted-avg costPrice** AND the **StockMovement.unitCost**; store `landedUnitCost` on the item + `landedBasis` on the purchase. Document math (subTotal/grandTotal) and the integrity invoice-invariant are UNCHANGED (otherCharges stays in grandTotal). Basis NONE = old behaviour (freight expensed via the balance sheet `purchaseGap`).
- **Balance sheet (`computeBalanceSheet`):** the ONLY sacred-function change — `inventoryValueAdded` now sums `qty × (landedUnitCost ?? unitCost)`, so allocated freight is inventory (not a gap) while un-allocated freight stays expensed. **Purchase returns unchanged** — reverse at billed cost; the existing `revaluation = stockValue − flowInventoryValue` term auto-recognises the freight-on-returned-goods as a loss (verified symbolically for full + partial returns, then in the e2e).
- Web: Purchases form — a "Add freight to cost" selector (By value / By quantity / No-expense, default By value) appears when freight > 0, with a live **per-line landed unit-cost** preview mirroring the server allocation; purchase detail shows each line's landed cost + a freight-treatment note. `PurchaseItem.landedUnitCost` / `Purchase.landedBasis` / `LandedBasis` types.
- **Verified (throwaway DB, dropped):** 25/25 — VALUE single (100@10 + ₨200 → landed 12, costPrice 12); VALUE multi with remainder (₨500 → 116.67 / 58.33); QTY (+₨5/unit → 15); NONE (costPrice stays 10, landedUnitCost null); sale COGS = landed 120 / profit 80; partial return credits vendor billed ₨400 and stays balanced; **integrity all-green + balance sheet ₨0 after every step.** Both apps tsc clean.

**C3 — Contractor rate contracts (DONE).** A customer's agreed per-item rates that hold for a date range auto-fill the POS sale line for the covered products. **Pure POS pre-fill (like price groups) — the sale snapshots the posted unitPrice, so editing/expiring a contract never changes past bills → zero accounting effect** (verified: editing a contract to ₨999 left a prior sale at ₨275).
- Schema: `RateContract` (refNo RC-, customer, name, validFrom/validUntil, isActive, notes) + `RateContractItem` (productId, price, unique per contract) + Customer/Product back-relations + `rate_contract` counter. Migration `20260721064713_c3_rate_contracts` (additive; real DB migrated, integrity still ₨0).
- Server: `rate-contracts.routes.ts` — CRUD (gated write to SUPER_ADMIN/ADMIN/MANAGER) + `GET /rate-contracts/rates/:customerId` resolver that returns the rates in force TODAY (isActive && validFrom≤now≤validUntil; validFrom stored start-of-day, validUntil end-of-day; when two active contracts cover a product the **later-starting one wins**) plus the primary contract for the banner. List carries a computed `status` (active/upcoming/expired/inactive). Mounted `/api/v1/rate-contracts`.
- Web: **Rate Contracts** page (People nav, FileSignature icon) — table with status badges + editor modal (customer search, date range, product-rate lines with list-price reference, active toggle). **POS auto-apply:** on customer select it fetches the resolver; `addProduct` uses the contract rate if covered; a reprice effect re-prices every **non-manually-edited** cart line when the customer changes (contract rate if covered, else list price — Line now carries `listPrice`/`contractPriced`/`priceEdited`); a "contract" tag shows on those lines + an accent banner ("Contract RC-… agreed rates apply"). Cashier edits set `priceEdited` so reprice won't clobber them. `RateContract`/`RateContractItem`/`RateResolution` types.
- **Verified (throwaway DB, dropped):** 20/20 — status computation; today's resolution (P1→275 as later contract B beats A, P2→500 from A); expired/upcoming/inactive ignored; other customer empty; sale snapshots contract price 275 (profit 375); **editing contract→999 left the past sale at 275**; validation (bad dates / empty items → 400); delete drops rates; integrity all-green + balance sheet ₨0. Both apps tsc clean.
- **Note:** F6 price groups were management-only (never wired into POS pricing); C3 introduces the POS customer-pricing path, scoped to contract rates. Price-group POS auto-apply remains a separate future task.

**C4 — Site-wise customer sub-ledgers (DONE).** One contractor buys for several sites/projects; each sale (POS) and each customer receipt can be tagged to a site, and the shop tracks udhaar PER site. **Design that keeps accounting safe: per-site balances are DERIVED** (the same customer-ledger rows, filtered by the site tag) — there is NO cached per-site balance and NO new invariant. `Σ(site balances) + an "unassigned" residual (opening balance + untagged activity) == the customer's single balance` by construction, so integrity is untouched.
- Schema: `CustomerSite` (customer, name, address, isActive) + `Sale.siteId`/`site` + `Payment.siteId`/`site` (both `onDelete: SetNull`) + Customer.sites + indexes. Migration `20260721071902_c4_customer_sites` (additive; real DB migrated, integrity still ₨0).
- Server: `postPayment` gained a `siteId` param. Sales POST accepts `siteId` (validated to belong to the sale's customer), stores it on the Sale (draft/quote/completed) and tags the SALE_RECEIPT payments; **returns inherit** the original's site + tag the REFUND_OUT. Customer-receipt accepts `siteId` (or **inherits** the site when allocated to a specific invoice; validated to the customer). `customer-sites.routes.ts`: `GET /?customerId=` (sites with derived balances + unassigned + total + `reconciles` flag), `GET /:id/ledger?from&to` (per-site running statement), POST/PATCH/DELETE (delete → deactivate if the site has history). `saleInclude` now returns `site {id,name}`. Mounted `/api/v1/customer-sites`.
- Web: `CustomerSitesModal` (People → Customers → map-pin button) — add/edit/delete sites, per-site "owes" balance, an **unassigned + total = customer-balance reconcile footer**, and a per-site **statement** (nested). **POS**: a site dropdown appears when the selected customer has sites → tags the sale (cleared on customer change / reset). **Receive payment**: a site dropdown (hidden when allocating to a specific invoice, since that inherits the invoice's site). `CustomerSite`/`CustomerSiteBalance`/`SiteBalancesView`/`SiteLedger` types + `Sale.site`.
- **Verified (throwaway DB, dropped):** 24/24 — site A 400 / B 300 / unassigned 400 / total 1100 == customer balance; per-site ledger closing/debit/credit; **reconciles=true through tagged sales, a site-allocated receipt, a partial return (site A → −100), opening balance → unassigned, and site deactivate**; cross-customer site rejected on both sale & receipt; sale carries site name; integrity all-green + balance sheet ₨0 after every step. Both apps tsc clean. Sample sites added to the real DB (Ahmad Builders → DHA Phase 5, Bahria Town).

**C5 — Vehicle/trip & freight billing (DONE).** Log a vehicle run: driver + vehicle, the challans (F2) it carried, freight charged (recovered from the customer) vs freight paid (to the transporter), and the delivery margin. **`freightPaid` OPTIONALLY posts a real Expense** (money out + P&L) and **`freightCharged` is record-only** (the real recovery already sits on the sale invoices as `otherCharges`, so re-posting would double-count) — so the ONLY accounting effect is the optional freight expense.
- Schema: `DeliveryTrip` (TRP- ref, date, vehicleNo, driverName/phone, optional customer, freightCharged, freightPaid, `expenseId` @unique, notes) + `DeliveryNote.tripId` (onDelete SetNull) + Customer/User/Expense back-relations + `delivery_trip` counter. Migration `20260721083053_c5_delivery_trips` (additive; real DB migrated, integrity still ₨0).
- Server: `delivery-trips.routes.ts` — POST creates the trip; when `freightPaid>0 && paidMethodId` it **books an Expense** (upserts the "Transport & Loading" category, EXP- ref, `postPayment("EXPENSE")`) and links `expenseId`; attaches `challanIds` (sets their tripId). DELETE **reverses the freight expense** (rolls the account entries back, deletes the Payment + Expense — mirrors the expenses delete) and detaches challans. GET list carries a derived `margin` (charged − paid) + totals. Gated write `expenses.create` (money can move), read `sales.view_*`. Mounted `/api/v1/delivery-trips`.
- Web: **Delivery Trips** page (Sell nav, Route icon) — margin summary cards + a table (vehicle/driver, customer, challan count, charged/paid/margin, "booked EXP-…" tag, delete) + a create modal (vehicle/driver, optional customer, freight charged/paid, a "Book freight paid from" account selector [blank = just record], live margin, an "Attach challans" picker of unassigned DELIVERED challans, notes). `DeliveryTrip`/`DeliveryTripTotals` types + `DeliveryNote.tripId`.
- **Verified (throwaway DB, dropped):** 23/23 — freightPaid 2000 booked → cash −2000, Expense "Transport & Loading" ₨2000, margin 1000; record-only trip (no account) posts nothing; challan attaches + links to its sale; list totals; **delete reverses the ₨2000** (cash restored, expense gone); integrity all-green + balance sheet ₨0 after every step. Both apps tsc clean.

**C6 — Rod/pipe cutting & offcut tracking (DONE). ✅ Batch C complete.** Cut a full bar/pipe/sheet into the piece a customer needs plus leftover offcuts. A cut is a **value-conserving stock CONVERSION — no money moves**: the bar leaves stock (`CUT_OUT`) and each piece/offcut comes back in (`CUT_IN`) at its share of the bar's weighted-avg cost, split by **length (fallback qty)**, last output takes the rounding remainder. Optional saw/scrap **wastage leaves as a `DAMAGE` loss** (real P&L hit — the schema's WASTAGE reason).
- **Key correctness point:** `applyMovement` updates `stockQty` but NOT `costPrice`. So each `CUT_IN` must fold its allocated cost into that product's weighted-avg `costPrice` **exactly like a purchase does** (read cur qty/cost → `weightedAvg` → update costPrice → applyMovement). Without this the offcut sits at ₨0 on the books (the sheet still "balances" but via a phantom revaluation loss, and a later sale gets ₨0 COGS). The first e2e run caught this (piece cost 0, profit 1000); fixed → piece ₨300, offcut ₨100, sold-piece COGS ₨300 / profit ₨700.
- Schema: `CuttingJob` (CUT- ref, sourceProduct, sourceQty, sourceUnitCost snapshot, wastageQty, totalCost, notes, user) + `CuttingOutput` (product, kind PIECE/OFFCUT, qty, lengthFt, unitCost) + `CutOutputKind` enum + `StockMoveType.CUT_OUT`/`CUT_IN` + Product `cutSources`/`cutOutputs` + User `cuttingJobs` + `cutting` counter. Migration `20260721104316_c6_cutting_offcuts` (additive; real DB migrated).
- Server: `cutting-jobs.routes.ts` — POST (one `$transaction`): allocate value across outputs, create job+outputs, `CUT_OUT` −(sourceQty−wastage) at avg, `DAMAGE` −wastage (if any), `CUT_IN` each output (with the weighted-avg costPrice fold), audit. GET list/`:id`. Guards: source must be STANDARD, `wastage < sourceQty`, enough stock (409). Gated write `stock.adjust`, read `products.view`. Mounted `/api/v1/cutting-jobs`. **No change to computeBalanceSheet** — CUT_OUT/CUT_IN net to ~0 in flowInventoryValue, DAMAGE flows through the existing `adjustmentValue` term, rounding absorbed by `revaluation`.
- Web: **Cutting** page (Inventory nav, Scissors icon) — history table (source −qty, piece/offcut badges, wastage, value) + a "New cut" modal: source product picker (shows stock), qty cut + wastage, add Piece/Offcut lines (kind, product, qty, length ft) with a **live cost-split preview** mirroring the server + a "value returned vs to-return" reconciliation line. `CuttingJob`/`CuttingOutput`/`CutOutputKind` types. Route `/cutting`.
- **Verified (throwaway DB, dropped; real DB untouched):** 25/25 — ₨400 bar → 30ft piece ₨300 + 10ft offcut ₨100 (length split), no-wastage cut conserves inventory value, offcut weighted-avg to ₨200, wastage 0.25 removed exactly ₨100 as a loss, sold piece COGS ₨300 → profit ₨700, over-cut (409) & full-waste (400) guards, **integrity all-green + balance sheet ₨0 after every step**. Both apps `tsc --noEmit` clean.

**Batch C is fully done (C1–C6).**

**Batch D — Inventory & purchasing (D1–D5) DONE.** One migration `d_inventory_purchasing`.
- **D1 Cost/price history:** `PriceHistory` model + `lib/price-history.ts` `logPriceChange`, written on product CREATE, manual UPDATE (only when cost/sale changed), and each PURCHASE weighted-avg cost change (purchases + GRN). New `GET /reports/price-history?productId` + web report (product picker). Read-only, zero ledger effect.
- **D2 Negative-stock/backorder:** `allow_negative_stock` setting (EDITABLE_KEYS + Settings toggle). Sales read it → pass `allowNegative` to `applyMovement`; a line that drives stock < 0 is flagged `SaleItem.backordered`. New `GET /reports/backorders`. Off by default → ledger still 409s on over-issue. Balance sheet stays exact (negative stock value mirrors the extra COGS booked).
- **D3 Barcode/label print:** `lib/barcode.ts` dependency-free Code128-B encoder + **Print Labels** page (Inventory nav) — product picker, copies, columns, name/price/SKU/barcode toggles, `window.print()` with a visibility-based print stylesheet. Web-only, no schema/server.
- **D4 Vendor debit/credit notes:** `VendorNote` (`VendorNoteType` CREDIT/DEBIT) + `vendor-notes.routes.ts` (list/create/delete). CREDIT lowers payable (income), DEBIT raises it (cost); the vendor balance moves in one tx. **computeBalanceSheet** gains a `vendorNotesNet = credits − debits` term in retainedEarnings, and the **vendor-reconciliation integrity check** adds `+ debitNotes − creditNotes` — so Assets = Liab + Equity holds. New **Vendor Notes** page (People nav). Gated `vendors.edit`.
- **D5 PO → GRN:** `PurchaseOrder`/`PurchaseOrderItem` (`PurchaseOrderStatus`) + `Purchase.purchaseOrderId`. `purchase-orders.routes.ts` — create (DRAFT, non-financial), PATCH status (SENT/CANCELLED), `POST /:id/receive` books a RECEIVED `Purchase` for the received lines (reusing the proven stock-in + weighted-avg + payable posting), advances `qtyReceived` + PO status (PARTIAL→RECEIVED), partial receipts + over-receipt guard. **No new balance-sheet term** (a GRN is just a Purchase). New **Purchase Orders** page (Inventory nav). Gated `purchases.create`.
- **Verified (throwaway DB, dropped):** 24/24 — D2 oversell → stock −3 + backorder flag + report + 409 when off; D4 credit/debit notes reshape payable with the BS counterpart + reversal rolls back; D5 partial receipt (payable +₨200) then full receipt → RECEIVED + over-receipt 400; D1 price-history rows; **integrity all-green + balance sheet ₨0 after every step**. Both apps `tsc --noEmit` clean.

**Batch E — Customer engagement & messaging (E1–E4) DONE.** Migration `e_messaging` (MessageChannel += SMS; Customer += email, reminderTier, lastReminderAt). Messaging writes NOTHING to the ledgers → integrity inherently untouched (verified).
- **E1 Auto-email statements:** `lib/statements.ts` — `buildStatementDoc` (running-balance statement rebuilt from sales/returns/receipts) → `buildPdf` → `emailCustomerStatement` (SMTP attach). `runMonthlyStatementsIfDue()` deduped by a `statements_last_period` setting, hooked into the daily sweep. `POST /outreach/statements/email` (one or all-with-email+balance). `mailer.sendMail` gained `attachments` + `smtpConfigured()`.
- **E2 SMS gateway 🔌:** `lib/sms.ts` — provider-agnostic HTTP sender from a `sms_api_url` template with `{key}{sender}{to}{text}` (GET or POST JSON). Throws a clear error until configured. Keys added to `INTEGRATION_KEYS`; Settings → Integrations SMS card. **Owner must fill the provider URL + key/sender to actually send SMS.**
- **E3 Bulk greetings:** `POST /outreach/campaign` {channel, message, subject?} → SMS/Email sent server-side, WhatsApp returns wa.me links for the client; each send logged in MessageLog. `{name}{shop}` placeholders.
- **E4 Tiered udhaar escalation:** `lib/reminders.ts` — tiers by oldest-due age (defaults 15/30/60d, texts + cooldown from settings), `planReminders()` preview + `runUdhaarEscalation()` (sends via SMS→Email→else QUEUED WhatsApp, sets `reminderTier`/`lastReminderAt`, resets paid-off customers). Hooked into the daily sweep. `GET /outreach/reminders/preview` + `POST /outreach/reminders/run`.
- Web: **Outreach** page (People nav, Megaphone) with Statements / Bulk Message / Udhaar Reminders tabs; customer **email** field; Settings → Integrations **SMS gateway** card. Reminder tier day/text settings are in EDITABLE_KEYS (sane defaults; no dedicated UI yet).
- **Verified (throwaway DB, dropped):** 11/11 — 40-day debt → preview tier ≥2 + send + tier advances + cooldown; campaign wa.me links; statements endpoint graceful with no SMTP; MessageLog captured; **integrity all-green + BS ₨0**. Both apps tsc clean.

**Batch F — HR & staff (F1–F3) DONE.** Migration `f_hr` (`User.commissionPercent`). No new accounting surface (payslip read-only, attendance no-money, commission read-only; salary path unchanged).
- **F1 Payslip PDF:** `GET /reports/payslip?salaryId&format` builds a ReportDoc (base/bonus/deductions/advance → net paid) via the shared exporter. Download button (FileDown) on the Salaries tab.
- **F2 Attendance CSV import:** `POST /attendance/import` {csv} — flexible header parser (code|employeecode|id, date, status[P/A/H/L] OR in/out punches → PRESENT/HALF_DAY), resolves employee by code, upserts one mark/day, reports imported/skipped/errors. Upload button on the Attendance tab.
- **F3 Salesman commission:** `User.commissionPercent` (users create/update + Users form field). `GET /reports/commission?from&to` groups sales by userId, net sales (minus returns) × the rep's %. New "Salesman Commission" report entry.
- **Verified (throwaway DB, dropped):** 7/7 — commission ₨1000×5%=₨50, salary ₨20000 payslip + PDF download, attendance import (2 in / 1 skipped bad code), **integrity all-green + BS ₨0**. Both apps tsc clean.

**Batch G — POS experience (G1–G5) DONE.** Migration `g_pos` (`Customer.loyaltyPoints` + `LoyaltyEntry`/`LoyaltyType`).
- **G1 Favourites:** `pos_favourites` setting (comma-sep product IDs). POS: a ★ toggle on each catalog tile + a "Favourites" quick-add strip; managed inline (PATCH /settings).
- **G2 Walk-in return:** `POST /sales/blank-return` — a return Sale with no customer/original: stock back in (SALE_RETURN at current cost) + cash REFUND_OUT. Same accounting shape as an invoiced return (verified BS-safe). New **Walk-in Return** page (Sell nav).
- **G3 Discount approval:** `max_discount_percent` setting. Sales route computes the manual discount % (bill + line discounts / gross) and 409s `DISCOUNT_APPROVAL` when over the cap unless `overrideDiscount` + the user has `sales.discount_over_limit`. POS catches it and offers manager approval (mirrors the credit-limit flow).
- **G4 Loyalty:** earn on the paid total (block-based: `floor(grandTotal/100) × earn_per_100`), redeem points as a bill discount (`points × redeem_value`, capped at subtotal). Points are a **memo, not a booked liability** — earning has no accounting effect, redeeming is just a discount (flows through totals) → balance sheet untouched. `LoyaltyEntry` logs EARN/REDEEM. POS shows points + a redeem input; settings on Shop Profile.
- **G5 Customer display:** `/pos/display` full-screen page listens on a `pos-display` BroadcastChannel; POS broadcasts the live cart + payable + (on completion) thank-you/change. Same-PC 2nd monitor, no server.
- **Verified (throwaway DB, dropped):** 12/12 — earn 20 → redeem 10 (₨10 off, grand ₨490) → 18 pts; discount 20% blocked (409) then approved with override (grand ₨800); walk-in return stock +2 + cash refund; favourites persist; **integrity all-green + BS ₨0 throughout**. Both apps tsc clean.

**Next:** Batch H — platform & safety (H1 offsite backup 🔌 · H2 saved report filters · H3 2FA · H4 import-FX capture · H5 GST register · H6 bank reconciliation · H7 offline POS). H1 needs owner cloud creds.

---

## F6 price groups COMMITTED + web build-breaker fixed + full E2E re-verified (2026-07-20)

Owner review session ("is it working?"). Two findings + one E2E proof:

1. **The entire F6 (customer price groups) module was uncommitted** on `main` — last commit was F5 (`5e70672`). 9 modified + 3 new files (108 insertions) sitting in the working tree: `PriceGroup`/`PriceGroupItem` schema + `Customer.priceGroupId`, `price-groups.routes.ts`, `/reports/margins-by-group` report, `pages/PriceGroups.tsx`, the Customers price-group dropdown, nav + route + types. Migration `20260703172805_f6_price_groups` was already applied to the real DB.
2. **Build-breaker inside it:** `apps/web/src/pages/Customers.tsx` used the `PriceGroup` type without importing it → `apps/web` `tsc --noEmit` FAILED (`TS2304: Cannot find name 'PriceGroup'`), which breaks `npm run build -w apps/web`. This is why the last "both apps tsc clean" claim was stale — the final tsc was never re-run on the F6 batch. **Fixed** by adding `PriceGroup` to the type import on line 5. Re-ran tsc: **both apps clean.**
   - Committed the whole F6 module as ONE commit (project convention = one commit per module).

**Full sale→ledger→P&L E2E re-verified on throwaway DB `softglaze_e2e`** (created/migrated[9 migrations]/seeded/dropped; real `softglaze` DB confirmed untouched — probed `needsSetup=true`/0 products before any write). Ran against the **current source via tsx** (not the stale pre-F1 `dist`). Scenario: create Cement (cost ₨700 / sale ₨1000 / opening 100 bags) → sell 10 bags @ ₨1000 to a credit customer, pay ₨4000 cash. **All 15 assertions PASSED:** grandTotal ₨10,000 · paid ₨4,000 · udhaar ₨6,000 · COGS snapshot ₨7,000 · profit ₨3,000 · customer ledger closes at ₨6,000 (== cached balance) · stock 100→90 · P&L revenue ₨10,000 / COGS ₨7,000 / gross ₨3,000 / net ₨3,000 · **integrity all-green 8/8** · balance sheet imbalance ₨0 (opening-stock equity fix confirmed live). Script: scratchpad `e2e.mjs`.

**Not pushed to origin** (owner to confirm push). Next: owner wants a new feature round — 30+ ideas delivered.

---

## Future roadmap started — F1 Cheque tracking DONE ✅ + 2nd opening-balance accounting bug fixed (2026-07-03)

Owner asked to "complete all features" (docs/10 future roadmap F1–F18), installer deferred. Building them one at a time, verified. **F1 (post-dated cheques) complete**, migration `20260703082504_f1_cheques`.

**Model:** a pending cheque sits in a non-cash holding account — RECEIVED → "Cheques in Hand" (asset), ISSUED → "Post-dated Cheques" (contra). Receiving a customer cheque posts a CUSTOMER_RECEIPT into Cheques-in-Hand (customer udhaar drops now — shopkeeper expectation) + creates the Cheque (PENDING). CLEAR = FundTransfer-style move to/from a real bank account. BOUNCE/CANCEL = a reversing (negative-amount) CUSTOMER_RECEIPT/VENDOR_PAYMENT so the party owes again + the holding account returns to 0. All integrity-safe (reconciliation nets the +X and −X receipts to 0; transfers don't touch the payments-vs-ledger check).
- Schema: `Cheque` model + `ChequeDirection`/`ChequeStatus` enums + `NotificationType.CHEQUE_DUE`; back-relations on Customer/Vendor/User. `lib/cheques.ts` (ensureHoldingAccount). `routes/cheques.routes.ts` (list, summary, receive, issue, :id/clear, :id/bounce, :id/cancel) mounted at `/api/v1/cheques`; gated by existing payments.* perms. Cheque-due sweep added to `notify.runSweep`.
- Web: `pages/Cheques.tsx` (summary cards: in-hand / issued / due-soon; direction+status filters; register table with Cleared/Bounced/Cancel actions; Receive/Issue/Clear modals + bounce/cancel confirm) + nav ("Cheques", ScrollText icon) + route + `Cheque`/`ChequeSummary` types.
- **Verified (throwaway `softglaze_gaptest` DB, dropped after):** 19/19 — receive settles udhaar into Cheques-in-Hand, clear moves it to Cash, bounce restores the debt, issue/clear mirror for vendors with the contra account, integrity all-green + balance sheet ₨0. Real DB integrity still ₨0 (no regression); both apps tsc clean.

**2nd opening-balance accounting bug FIXED (same family as the opening-stock one):** opening **customer/vendor balances** (udhaar owed from before the shop started on the system) are opening assets/liabilities with NO equity counterpart → balance sheet was short by (opening receivables − opening payables). Prior tests never used opening party balances so it hid; the F1 test surfaced it. Fixed in `computeBalanceSheet`: added `openingPartyCapital = Σ customer.openingBalance − Σ vendor.openingBalance` to equity (new "Opening balances" equity line on the Accounts sheet). ⚠️ Together with the opening-stock fix, the balance sheet now stays exactly balanced once the owner enters REAL opening inventory + opening udhaar at launch (Phase 9) — both were latent launch-breakers.

**Next:** F2 (delivery challans), then F3 (advance bookings) … per docs/10 order. Installer build still deferred (owner said later).

---

## Gap-closure round + Windows installer (2026-07-03) — 10 audit gaps closed, opening-stock accounting bug FIXED ✅

A 4-agent audit of every feature doc vs. code found the core 100% built (accounting sacred, price-volatility snapshots confirmed, 34/34 future items correctly NOT built early) but ~10 convenience/reporting gaps. Owner said "close all 10". Done, both apps tsc clean, and the new money path E2E-tested on a **throwaway DB** (`softglaze_gaptest`, created/migrated/seeded/dropped — real DB untouched): 12/12 checks incl. integrity all-green + balance sheet ₨0.

**Gaps closed (server + web):**
- G1 Per-line POS discount — POS cart now has a per-item discount input (server math + `SaleItem.discount` already existed; verified 10×1000 − 500 line disc → grandTotal 9500).
- G2 Sales report filters — `/reports/sales` now takes `customerId` (invoice register for one customer) and `productId`/`categoryId` (switches to a line-item "Sales by Item" view); Reports UI has the 3 dropdowns.
- G3 Payment allocation — customer-receipt/vendor-payment accept optional `saleId`/`purchaseId`, cap to that bill's due, update the bill's paid/due in the same tx; new `GET /payments/{customer,vendor}-bills/:id`; PaymentModal has an "Apply to invoice/bill" picker. Integrity-safe (reconciliation derives balances from grandTotal−payments, not dueAmount).
- G4 Purchase WhatsApp + phone fix — `lib/phone.ts waNumber/waLink` (local 03xx→92…); used in POS success overlay + a new "WhatsApp vendor" button in ViewPurchase (added vendor.phone to purchaseInclude + Purchase type).
- G5 Messages page — `pages/Messages.tsx` (lists MessageLog, channel filter) + nav + route.
- G6 Dashboard lists + top-customers — dashboard returns `recentSales` + `lowStockItems` (rendered as two list cards); new `/reports/top-customers` report + Reports nav entry.
- G7 Immediate low-stock — `notifyLowStock(productIds)` in `lib/notify.ts`, called fire-and-forget after a sale and after an outward stock adjustment.
- G8 CREDIT_LIMIT bell — sale over-limit override now raises a CREDIT_LIMIT notification (deduped).
- G9 Salary report — `/reports/salaries` (PDF/Excel) + Reports nav entry; **logo now embedded in ALL report PDFs** (`report-export.ts` reads shop_logo off disk, sharp→PNG data-URI since pdfmake can't read webp).
- G10 My-account + email templates — `PATCH /users/me` (self name/phone/password, verifies current pw, bcrypt 12) + a "My account" modal in Layout; 4 `tmpl_email_*` keys added to INTEGRATION_KEYS + email-template fields in Settings → Integrations.

**IMPORTANT accounting fix (found via the throwaway E2E):** creating a product **with opening stock** (StockMovement type `OPENING`) added inventory (asset) with NO equity counterpart → balance sheet was short by exactly the opening-stock value (integrity FAILED once real inventory is entered — which is Phase 9!). Prior integrity tests never hit it because they added stock via **purchases** (which have a cash/payable counterpart), not opening stock. Fixed in `computeBalanceSheet`: opening-stock value is now recognised as **opening capital (equity)** (`SELECT SUM(qty*unitCost) WHERE type='OPENING'`), added to equityTotal + shown as an "Opening stock" equity line on the Accounts balance sheet. Re-verified: balance sheet balances ₨0 with opening stock. Real DB (all-zero) integrity still green — no regression.

**Windows installer (Phase 7 completion):** fixed 4 real packaging bugs to get `npm run dist` working — (1) `predist` used `-w apps/server` which fails from the desktop cwd → now `npm run build --prefix ../server && … ../web`; (2) electron version undetectable in the hoisted monorepo → pinned `electronVersion: "33.4.11"`; (3) an incomplete earlier `npm install` had left `app-builder-lib`/`app-builder-bin` missing → `npm install` restored them; (4) **the big one** — electron-builder's default "install production deps" step PRUNES the shared root node_modules to prod-only, deleting every devDep incl. its own tooling mid-build → moved config to `apps/desktop/electron-builder.cjs` with `beforeBuild: async () => false` + `npmRebuild: false` ("node_modules managed externally", per electron-builder docs via Context7). Also fixed a packaged-mode uploads bug (`path.join`→`path.resolve` in app.ts + lib/upload.ts, so the absolute `%APPDATA%/SoftGlaze/uploads` isn't corrupted). Slimmed extraResources (excluded electron/electron-builder/typescript/vite/esbuild/@types/etc — build-only). Build produces `apps/desktop/release/SoftGlaze-Stock-Manager-Setup-0.1.0.exe` (unsigned — fine for the owner's PC). GUI-launch + clean-PC install remain the owner's step.

**Verified:** server+web tsc clean; production build clean; real-DB integrity all-green (imbalance ₨0); 36 GET endpoints + new endpoints all `ok`; PDF (now with logo)/Excel valid; Playwright sweep of the changed pages (POS/Reports/Messages/Payments/Dashboard + My-account modal + Salary/Top-Customers reports) = 0 console errors. Throwaway `softglaze_gaptest` DB dropped; scratchpad `test-gaps.cjs` is the E2E.

---

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
