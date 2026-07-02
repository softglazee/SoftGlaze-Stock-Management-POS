# SESSION-NOTES.md

> Living hand-off file. Updated after every module or mid-task stop.
> Read this at the start of every session (see CLAUDE.md → Grounding & session continuity rules).

## Current status (2026-07-02) — Phase 0 COMPLETE ✅

**What was just done (Phase 0, all verified):**
- Added "Grounding & session continuity rules" to CLAUDE.md; created this file.
- Environment: Node v22.21.1 ✓, git 2.47 ✓, **no Docker & no admin rights** on this PC.
- Database: portable **PostgreSQL 16.9** (EDB binaries) installed OUTSIDE the repo at
  `h:\softglaze-stock-manager\pg` (binaries `pg\pgsql`, data `pg\data`, log `pg\pg.log`).
  User `softglaze` / password `softglaze_dev` / db `softglaze` / port 5432 — matches `.env` defaults.
  **Start it with `powershell -ExecutionPolicy Bypass -File scripts\start-db.ps1`** (it is NOT a
  Windows service — it does not auto-start after a reboot).
- `npm install` (all workspaces) ✓ · `.env` files created from examples (server + web) ✓
- `npx prisma migrate dev --name init` ✓ (migration `20260702033050_init`) · seed ✓
- `npx tsc --noEmit` clean in both `apps/server` and `apps/web` ✓

**Verified in the running app (dev servers via `npm run dev`):**
- `GET /api/v1/health` → 200 `{"ok":true}` ✓
- Login page loads; dark/light switcher toggles and persists (`softglaze-theme` key) ✓
- Screenshots checked at 1440px and 375px, dark + light ✓
- Owner account registered (Azhar Ali / admin@softglaze.com) → role **SUPER_ADMIN** confirmed in DB ✓
- Second register attempt → 403 "Registration is closed" ✓ (registration correctly closes after first user)
- Dashboard renders logged-in as SUPER_ADMIN ✓

**Unverified / known issues:**
- `favicon.ico` 404 in browser console (cosmetic only — add favicon in a later phase).
- Electron desktop app (`npm run desktop`) not tested yet — scheduled for Phase 7.
- DB does not auto-start on reboot (portable install, no admin). Always run `scripts\start-db.ps1` first.

**Exact next step:** Wait for owner's confirmation, then start **Phase 1** using the Phase 1 prompt
in `KICKOFF-PROMPT.md`: Business Type presets + onboarding, Categories (sub-categories & images),
Units with conversions, Products (SKU auto, barcode, multi-image, min-stock), Customers, Vendors.
