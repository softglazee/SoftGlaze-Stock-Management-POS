import "dotenv/config";
import cron from "node-cron";
import app from "./app";
import { prisma } from "./lib/prisma";
import { runSweep } from "./lib/notify";

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`💎 SoftGlaze Stock Manager API running on http://localhost:${PORT}`);
});

/**
 * Daily notification sweep (low stock, debt/payable reminders). The time comes from
 * the `low_stock_sweep_time` setting (HH:MM, default 09:00). Runs in both desktop and
 * VPS modes; the sweep dedupes so re-running is safe.
 */
let scheduled: cron.ScheduledTask | null = null;
async function scheduleSweep() {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "low_stock_sweep_time" } });
    const [hh, mm] = (row?.value || "09:00").split(":").map((n) => Number(n));
    const expr = `${Number.isFinite(mm) ? mm : 0} ${Number.isFinite(hh) ? hh : 9} * * *`;
    if (!cron.validate(expr)) return;
    scheduled?.stop();
    scheduled = cron.schedule(expr, () => {
      runSweep().catch((e) => console.error("Notification sweep failed:", e));
    });
    console.log(`⏰ Daily reminder sweep scheduled at ${row?.value || "09:00"}`);
  } catch (e) {
    console.error("Could not schedule sweep:", e);
  }
}
scheduleSweep();
