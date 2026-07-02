# SESSION-NOTES.md

> Living hand-off file. Updated after every module or mid-task stop.
> Read this at the start of every session (see CLAUDE.md → Grounding & session continuity rules).

## Current status (2026-07-02) — Phase 1 COMPLETE ✅ (Phase 0 done earlier today)

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

**Exact next step:** Wait for owner's confirmation of Phase 1, then Phase 2 per KICKOFF-PROMPT.md:
Purchases (pay-later/udhaar to vendors first-class), stock ledger, weighted-average cost,
adjustments, purchase returns, low-stock alerts.
