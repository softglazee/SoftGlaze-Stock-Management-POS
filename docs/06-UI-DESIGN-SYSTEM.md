# SoftGlaze — UI Design System

The look must feel like the business: **steel, forge, and daylight warehouse** —
industrial, confident, precise. Not a generic pastel admin template.

## Design direction
- **Dark theme ("Forge")** — default. Deep steel/graphite surfaces, molten-amber accent.
  Feels like the shop at dusk: iron, heat, focus. Great for long POS sessions.
- **Light theme ("Daylight")** — bright warehouse: cool paper-white, graphite ink, same amber accent.
- **Signature element:** the amber "heat" accent used ONLY for money-critical actions
  (Complete Sale, Receive Payment) and live totals — everything else stays disciplined steel.
  One glance at the screen and your eye lands on the money.

## Tokens (already wired in `apps/web/src/index.css`)

| Token | Dark (Forge) | Light (Daylight) |
|---|---|---|
| --bg          | #101418 (graphite) | #F6F7F9 |
| --surface     | #171C22 | #FFFFFF |
| --surface-2   | #1F2630 (cards/hover) | #EEF1F4 |
| --border      | #2A323D | #DDE2E8 |
| --text        | #E8ECF1 | #1A2028 |
| --text-muted  | #93A0AE | #5A6675 |
| --accent      | #F59E0B (molten amber) | #D97706 |
| --accent-ink  | #100A00 (text on accent) | #FFFFFF |
| --success     | #34D399 | #059669 |
| --danger      | #F87171 | #DC2626 |
| --info        | #60A5FA | #2563EB |

Numbers/money always render in the tabular mono face so columns align like a ledger.

## Typography
- **Display/headers:** "Archivo" (wide industrial grotesk — signage energy), weight 600–700
- **Body/UI:** "Inter", 14–15px base
- **Money & codes:** "JetBrains Mono" with tabular numerals (invoice totals, SKUs, ledgers)
- Scale: 28/22/18/15/13. Sentence case everywhere. No thin weights on dark.

## Layout
- App shell: fixed left sidebar (icons + labels, collapsible) · top bar (search, theme
  toggle, user menu) · content area max-w none (data apps need width)
- Density: compact tables (40px rows), 8px spacing grid, 10px card radius, 1px borders
  (no heavy shadows — industrial flatness; shadow only on modals)
- POS screen is full-bleed: no sidebar, exit button instead — cashiers need every pixel

## Components to standardize early (Phase 1)
Button (primary=amber, secondary=steel outline, danger), Input/Select/DatePicker,
SearchBox, DataTable (sort/paginate/column money-align-right), Modal, Drawer,
Toast, Badge (stock status: In Stock green / Low amber / Out red), Card, StatCard,
EmptyState (with a helpful action), ConfirmDialog, Tabs, ThemeToggle ✅ (built).

## Page inventory (30 screens)
Auth: Login ✅, Register ✅
Shell: Dashboard ✅ (skeleton)
Inventory: Products list, Product form, Product detail, Categories, Units, Stock adjustments, Low stock
Trade: POS ⭐, Sales list, Sale detail, Sales returns, Quotations, Purchases list, Purchase form, Purchase detail
Parties: Customers, Customer detail+ledger, Vendors, Vendor detail+ledger
Money: Receive payment, Pay vendor, Payments list, Expenses, Day close / Cash book
Reports: Reports hub + 10 report screens (shared report layout: filters → table → PDF/Excel buttons)
Admin: Users, Settings, Audit log, Backup

## Interaction rules
- Every destructive action confirms with the item's name in the dialog
- Every save shows a toast named after the action ("Invoice INV-000123 saved")
- Every list has: search, empty state, loading skeleton
- POS keyboard map: F2 search · F4 qty · F7 discount · F9 payment · F10 complete · Esc void line
- Theme persists in localStorage AND respects OS preference on first load ✅
