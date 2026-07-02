import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { FileText, Sheet, BarChart3, TrendingUp, Truck, Boxes, Users, Receipt, CreditCard, Activity } from "lucide-react";
import { api, download, ApiError } from "../lib/api";
import { ReportTable } from "../lib/types";
import { fmtMoney } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { PageHeader, TableSkeleton, EmptyState, useToast } from "../components/ui";

type Cfg = { key: string; label: string; path: string; icon: typeof FileText; period?: boolean; basis?: boolean; perm?: string };

const REPORTS: Cfg[] = [
  { key: "profit-loss", label: "Profit & Loss", path: "/reports/profit-loss", icon: TrendingUp, period: true, perm: "reports.profit" },
  { key: "sales", label: "Sales Register", path: "/reports/sales", icon: Receipt, period: true },
  { key: "purchases", label: "Purchase Register", path: "/reports/purchases", icon: Truck, period: true },
  { key: "stock-valuation", label: "Stock Valuation", path: "/reports/stock-valuation", icon: Boxes, basis: true },
  { key: "receivables", label: "Receivables Aging", path: "/reports/receivables", icon: Users },
  { key: "payables", label: "Payables Aging", path: "/reports/payables", icon: Truck },
  { key: "expenses", label: "Expenses by Category", path: "/reports/expenses", icon: Receipt, period: true },
  { key: "sales-by-payment-method", label: "Sales by Payment Method", path: "/reports/sales-by-payment-method", icon: CreditCard, period: true },
  { key: "stock-movements", label: "Stock Movements", path: "/reports/stock-movements", icon: Activity, period: true },
];

export default function Reports() {
  const { can } = useAuth();
  const list = REPORTS.filter((r) => !r.perm || can(r.perm));
  const [active, setActive] = useState<Cfg>(list[0]);

  return (
    <div>
      <PageHeader title="Reports" sub="Every report on-screen, with PDF and Excel download. Numbers are rebuilt from the ledgers — they always reconcile." />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <nav className="card p-2 h-max lg:sticky lg:top-4">
          {list.map((r) => (
            <button
              key={r.key}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${active.key === r.key ? "bg-surface-2 text-ink font-semibold border border-edge" : "text-muted hover:text-ink hover:bg-surface-2"}`}
              onClick={() => setActive(r)}
            >
              <r.icon size={16} /> {r.label}
            </button>
          ))}
        </nav>
        <ReportView cfg={active} />
      </div>
    </div>
  );
}

function ReportView({ cfg }: { cfg: Cfg }) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [basis, setBasis] = useState<"cost" | "sale">("cost");

  const qs = new URLSearchParams({
    ...(cfg.period ? { from, to: `${to}T23:59:59` } : {}),
    ...(cfg.basis ? { basis } : {}),
  }).toString();

  const { data, isLoading, error } = useQuery({
    queryKey: ["report", cfg.key, qs],
    queryFn: () => api<{ report: ReportTable }>(`${cfg.path}?${qs}`),
    placeholderData: keepPreviousData,
  });
  const report = data?.report;

  async function dl(format: "pdf" | "xlsx") {
    try {
      const ext = format === "pdf" ? "pdf" : "xlsx";
      await download(`${cfg.path}?${qs}${qs ? "&" : ""}format=${format}`, `${cfg.key}.${ext}`);
    } catch (e) {
      toast((e as ApiError).message || "Download failed", "error");
    }
  }

  const cell = (row: Record<string, string | number | null>, col: ReportTable["columns"][number]) => {
    const v = row[col.key];
    if (col.money) return fmtMoney(v ?? 0);
    return v ?? "";
  };

  return (
    <div>
      {/* Filters + downloads */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        {cfg.period && (
          <>
            <div><label className="label">From</label><input type="date" className="input !w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="label">To</label><input type="date" className="input !w-40" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
        {cfg.basis && (
          <div>
            <label className="label">Value at</label>
            <select className="input !w-40" value={basis} onChange={(e) => setBasis(e.target.value as "cost" | "sale")}>
              <option value="cost">Cost price</option>
              <option value="sale">Sale price</option>
            </select>
          </div>
        )}
        <div className="flex-1" />
        <button className="btn btn-secondary" onClick={() => dl("pdf")} disabled={!report}><FileText size={15} /> PDF</button>
        <button className="btn btn-secondary" onClick={() => dl("xlsx")} disabled={!report}><Sheet size={15} /> Excel</button>
      </div>

      <div className="card overflow-hidden">
        {isLoading && !report ? (
          <TableSkeleton cols={5} />
        ) : error ? (
          <EmptyState title="Can't load this report" hint={(error as { message?: string }).message ?? "Please try again"} />
        ) : !report ? (
          <EmptyState title="No data" />
        ) : (
          <>
            <div className="px-4 pt-4">
              <h2 className="font-semibold display flex items-center gap-2"><BarChart3 size={16} /> {report.title}</h2>
              {report.meta?.length ? <p className="text-muted text-xs mt-0.5">{report.meta.map((m) => `${m.label}: ${m.value}`).join("  ·  ")}</p> : null}
            </div>
            {report.rows.length === 0 ? (
              <EmptyState title="Nothing in this period" hint="Try a wider date range." />
            ) : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-edge">
                      {report.columns.map((c) => <th key={c.key} className={`px-4 py-2.5 font-medium ${c.align === "right" ? "text-right" : ""}`}>{c.header}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, i) => (
                      <tr key={i} className="border-b border-edge last:border-0 hover:bg-surface-2/50">
                        {report.columns.map((c) => <td key={c.key} className={`px-4 py-2 ${c.align === "right" ? "text-right money" : ""}`}>{cell(row, c)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  {report.totals && (
                    <tfoot>
                      <tr className="border-t-2 border-edge font-bold bg-surface-2/40">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right money" : ""}`}>
                            {report.totals![c.key] != null ? cell(report.totals!, c) : i === 0 ? "Total" : ""}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
