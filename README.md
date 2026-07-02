# 💎 SoftGlaze Stock Manager

**Premium stock management + POS for any business** — built first for a building
materials shop (iron rods, cement, windows, doors, hardware) with selectable
Business Type presets for kiryana, electronics, clothing, pharmacy and more.

**Repo:** https://github.com/softglazee/SoftGlaze-Stock-Management-POS

> 🤖 **Working with Claude Code?** `CLAUDE.md` is the master instruction file (auto-read).
> `KICKOFF-PROMPT.md` has the exact prompt to paste to start — and prompts for every phase.

One codebase, two targets:
- 🖥 **Desktop app** for the shop PC (Electron, Windows installer)
- 🌐 **Browser app** on your own server (SaaS-style, access from anywhere)

Inventory · POS · Invoices (thermal + A4 PDF) · Customers & udhaar ledgers ·
Vendors & payables · Payments · Expenses · Profit & Loss · PDF/Excel reports ·
Product images · User roles (incl. Super Admin) · Employees & Salaries · WhatsApp + Email
notifications · Reminders (stock/debt) · Calculator · Dark/Light themes · Audit log · Backups.

---

## 📖 Read these first (15 minutes, in order)

| Doc | What it gives you |
|---|---|
| `docs/01-BUILD-PLAN.md` | **The roadmap** — phases we build together |
| `docs/02-ARCHITECTURE.md` | How the system fits together |
| `docs/03-DATABASE-SCHEMA.md` | The money & stock flows |
| `docs/04-FEATURES.md` | Full feature spec + role permissions |
| `docs/05-API-REFERENCE.md` | Every endpoint we'll implement |
| `docs/06-UI-DESIGN-SYSTEM.md` | The Forge/Daylight design language |
| `docs/07-DEPLOYMENT.md` | Desktop packaging + VPS hosting guides |
| `docs/08-CHECKLIST.md` | Tick-off progress tracker |
| `docs/09-EXTENDED-FEATURES.md` | Business presets, HR, WhatsApp/SMTP, reminders, calculator |

---

## 🚀 Quick Start (Phase 0)

### Requirements
- **Node.js 20+** — https://nodejs.org
- **PostgreSQL** — easiest via Docker Desktop, or install Postgres 16 directly
- **VS Code** — open this folder

### 1. Install dependencies
```bash
npm install
```

### 2. Start the database
```bash
docker compose up -d          # starts Postgres on localhost:5432
# (no Docker? install Postgres, create db "softglaze", update DATABASE_URL)
```

### 3. Configure environment
```bash
# Windows PowerShell:
copy apps\server\.env.example apps\server\.env
copy apps\web\.env.example apps\web\.env
# macOS/Linux:
# cp apps/server/.env.example apps/server/.env && cp apps/web/.env.example apps/web/.env
```
The defaults already match the Docker database — nothing to edit for dev.

### 4. Create the database tables + defaults
```bash
cd apps/server
npx prisma migrate dev --name init
npm run db:seed               # units, categories, payment methods, settings
cd ../..
```

### 5. Run it
```bash
npm run dev
```
- API → http://localhost:4000/api/v1/health
- App → **http://localhost:5173**

### 6. Create your owner account
Open the app → it detects a fresh install → **Register** → the first account
becomes **ADMIN**. After that, registration closes and staff are added from Users.

### 7. (Optional) See it as a desktop window
```bash
npm run desktop               # while npm run dev is running
```

---

## 🧭 What works right now (Phase 0 scaffold)
✅ Monorepo + full database schema (every table for the entire system)
✅ Secure auth: register (first = admin), login, JWT refresh, logout, role guards
✅ Dark/Light theme system with switcher (persists + respects OS setting)
✅ Login, Register, app shell with role-aware sidebar, dashboard skeleton
✅ Seeded shop data: units (bag/kg/ton…), categories (cement, sariya, windows…),
payment methods (Cash/Bank/JazzCash/EasyPaisa), expense categories, settings

## 🛠 What we build next — together, in VS Code
Open `docs/01-BUILD-PLAN.md`, then tell Claude:

> **"Phase 1 — let's build the Categories and Products modules."**

…and we go module by module until your whole shop runs on it.

---

## Common commands
```bash
npm run dev            # API + web together
npm run db:studio      # visual database browser (Prisma Studio)
npm run db:migrate     # create/apply a migration after schema changes
npm run build          # production build (server + web)
npm run desktop        # Electron window (dev)
```

## Troubleshooting
- **`P1001: Can't reach database`** → Postgres isn't running (`docker compose up -d`)
- **Port 4000/5173 busy** → change `PORT` in `apps/server/.env` / `--port` for Vite
- **Login says session expired constantly** → set proper `JWT_SECRET` values in `.env`
- Anything else → paste the exact error to Claude and we fix it together.
