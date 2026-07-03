# SoftGlaze Stock Manager — Desktop (Windows)

The desktop app is a thin **Electron** shell around the exact same server + web app.
On launch it starts the built API server (using Electron's own Node — no separate Node
install needed), which serves both the API and the web app on `http://localhost:4000`,
and opens a window there. To the user it's one normal Windows program.

- **Uploads** live in `%APPDATA%/SoftGlaze/uploads`.
- **Config** (database URL + auto-generated JWT secrets) is created on first run at
  `%APPDATA%/SoftGlaze/softglaze.config.json` — edit `databaseUrl` there to point at a
  different database without rebuilding.

## Database
The desktop app connects to a **PostgreSQL** database (same code path as the server —
zero risk to the accounting). Two ways to have Postgres on the PC:
1. The **portable PostgreSQL** already set up for this project (`..\..\pg`) — start it
   with `scripts\start-db.ps1` (or let it run as a background task).
2. A normal **PostgreSQL for Windows** install.

> Zero-install **SQLite** is possible for single-PC shops but needs a schema change
> (drop the `@db.Decimal` annotations) — decide with your developer if you want it.

## Try it without building an installer
From the repo root:
```bash
npm install                       # once, installs Electron for the desktop workspace
npm run build                     # build server (dist) + web (static)
# make sure PostgreSQL is running, then:
npm run desktop                   # opens the app in a desktop window
```
For live-reload development instead, run `npm run dev` in one terminal and, in another:
`set SOFTGLAZE_DEV=1 && npm run desktop` (loads the Vite dev server).

## Build the Windows installer
```bash
cd apps/desktop
npm run dist                      # electron-builder → release/SoftGlaze-Stock-Manager-Setup-x.x.x.exe
```
The installer bundles the built server, the web app, and the Node dependencies
(including the Prisma engine). Optional: drop a `build/icon.ico` (256×256) before
building to brand the app and installer.

## Test on the shop PC / a clean PC
1. Ensure PostgreSQL is available and the `softglaze` database exists and is migrated
   (`npx prisma migrate deploy` + `npm run db:seed` once).
2. Run the `Setup.exe`, launch **SoftGlaze Stock Manager** from the Start menu / desktop.
3. Register the owner account on first run, then do a full shop-day test.
