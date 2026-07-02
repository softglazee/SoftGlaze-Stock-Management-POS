# KICKOFF-PROMPT.md — How to start Claude in VS Code

## One-time setup (10 minutes, you do this once)

1. Unzip the project, open the folder in **VS Code**.
2. Open the terminal (`Ctrl + ~`) and connect your GitHub repo:
   ```bash
   git init
   git add -A
   git commit -m "chore: SoftGlaze Stock Manager scaffold (Phase 0)"
   git branch -M main
   git remote add origin https://github.com/softglazee/SoftGlaze-Stock-Management-POS.git
   git push -u origin main
   ```
3. Start Claude Code in the same terminal:
   ```bash
   claude
   ```
   Claude Code automatically reads `CLAUDE.md` — that file already contains all the rules,
   your MCP instructions, the design system, and the accounting laws.

---

## 🚀 THE KICKOFF PROMPT (copy-paste this as your first message)

```
Read CLAUDE.md fully, then docs/01-BUILD-PLAN.md and docs/08-CHECKLIST.md.
List which MCP servers/tools you have available in this session and tell me which
ones you'll use for design and codebase navigation.

Then complete Phase 0 end-to-end on my machine:
1. Check my environment (Node 20+, Docker or Postgres) and guide me through anything missing.
2. npm install, start the database, create .env files, run the first prisma migration, run the seed.
3. Start the dev servers and confirm: API health check OK, login page loads, dark/light
   switcher works, I can register the owner account (it becomes SUPER_ADMIN).
4. Fix any errors yourself. When everything runs, update docs/08-CHECKLIST.md,
   commit and push to GitHub.

Then give me a short plain-language summary of what works, and ask me to confirm
before starting Phase 1 (Business presets + Categories + Units + Products with images
+ Customers + Vendors). Remember: I'm a shop owner, keep explanations simple.
```

---

## Prompts for the next phases (paste when the previous phase is confirmed)

**Phase 1:**
```
Phase 1 per docs/01-BUILD-PLAN.md + docs/09-EXTENDED-FEATURES.md section 1:
Business Type presets with onboarding screen, Categories (with sub-categories & images),
Units with conversions, Products (SKU auto, barcode, multi-image upload, min-stock),
Customers and Vendors with opening balances. Use my design MCP for the screens but keep
docs/06 tokens. Type-check, test, tick checklist, commit+push, then tell me what to test.
```

**Phase 2:** `Phase 2: Purchases (pay-later/udhaar to vendors is first-class), stock ledger, weighted-average cost, adjustments, purchase returns, low-stock alerts.`

**Phase 3:** `Phase 3: the POS — full-screen, keyboard-first, split payments including credit/udhaar with limit checks, hold/resume, thermal 80mm + A4 PDF invoices with my logo, sales returns, quotations. This is the heart — make it fast and premium.`

**Phase 4:** `Phase 4: customer receipts & vendor payments, both ledgers with PDF statements, expenses incl. miscellaneous, Employees & Salaries per docs/09 section 2, the calculator widget, day-close cash book.`

**Phase 5:** `Phase 5: dashboard with premium charts (gradient area, donut, bars, aging) and ALL reports with PDF + Excel downloads. Then run the P&L acceptance tests in docs/09 section 8 and show me GET /reports/integrity is all-green.`

**Phase 6:** `Phase 6: users & roles UI, SUPER_ADMIN global settings (logo, invoice header/footer, business type), Integrations: SMTP with test email + WhatsApp wa.me messages on each sale/purchase and debt reminders, notification bell + reminders center, audit log, backup/restore.`

**Phase 7:** `Phase 7: production Electron mode and build the Windows installer (SoftGlaze-Stock-Manager-Setup.exe). Walk me through testing it on a clean PC.`

**Phase 8:** `Phase 8: deploy to my VPS per docs/07-DEPLOYMENT.md with HTTPS and daily backups. I'll give you server access details when you ask.`

---

## Everyday helper prompts

- `Something is broken: <paste the exact error>. Fix it and explain in one line what happened.`
- `Continue where we left off — check docs/08-CHECKLIST.md and git log, then resume.`
- `Review the last module against CLAUDE.md rules (transactions, decimals, RBAC, integrity) and fix violations.`
- `Show me this screen in light theme and make it as polished as dark.`
