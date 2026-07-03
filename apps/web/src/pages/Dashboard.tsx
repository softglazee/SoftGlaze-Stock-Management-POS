import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Wallet, Users, Truck, PackageX, Banknote, CalendarDays } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { api } from "../lib/api";
import { DashboardData } from "../lib/types";
import { fmtMoney, num } from "../lib/format";
import { useAuth } from "../context/AuthContext";

const PIE_COLORS = ["var(--accent)", "var(--info)", "var(--success)", "#a78bfa", "#f472b6", "#94a3b8"];

const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(1)}cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
};

function ChartTip({ active, payload, label, money = true }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 shadow-xl text-xs">
      {label != null && <p className="text-muted mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="capitalize">{p.name}:</span>
          <span className="mono font-semibold">{money ? fmtMoney(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/reports/dashboard") });
  const { data: recv } = useQuery({ queryKey: ["recv-aging"], queryFn: () => api<{ buckets: Record<string, number> }>("/reports/receivables"), enabled: can("reports.view") });

  const canProfit = data?.canProfit ?? false;
  const cards = [
    { key: "todaySales", label: "Today's Sales", icon: TrendingUp, value: data?.cards.todaySales, show: true },
    { key: "monthSales", label: "This Month", icon: CalendarDays, value: data?.cards.monthSales, show: true },
    { key: "todayProfit", label: "Today's Profit", icon: Banknote, value: data?.cards.todayProfit, show: canProfit },
    { key: "receivables", label: "Receivables (Udhaar)", icon: Users, value: data?.cards.receivables, show: can("reports.view") },
    { key: "payables", label: "Payables to Vendors", icon: Truck, value: data?.cards.payables, show: can("reports.view") },
    { key: "cash", label: "Cash & Bank", icon: Wallet, value: data?.cards.cash, show: can("reports.view") },
  ].filter((c) => c.show);

  const agingData = recv ? [
    { name: "0–30", value: num(recv.buckets.b0_30) },
    { name: "31–60", value: num(recv.buckets.b31_60) },
    { name: "61–90", value: num(recv.buckets.b61_90) },
    { name: "90+", value: num(recv.buckets.b90p) },
  ] : [];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold display">Salam, {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-muted text-sm mt-1">Here's how the shop is doing.</p>
        </div>
        {data && data.cards.lowStock > 0 && (
          <div className="card px-4 py-2 flex items-center gap-2 text-accent">
            <PackageX size={16} /> <span className="text-sm font-medium">{data.cards.lowStock} item{data.cards.lowStock > 1 ? "s" : ""} low on stock</span>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.key} className="card p-5 flex items-start justify-between">
            <div>
              <p className="text-muted text-sm">{c.label}</p>
              <p className="money text-2xl font-bold mt-2">{isLoading ? <span className="inline-block h-7 w-24 rounded bg-surface-2 animate-pulse" /> : (c.value ?? "—")}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-2 border border-edge flex items-center justify-center text-accent"><c.icon size={20} /></div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold display mb-3">Sales — last 30 days</h2>
          <div className="h-64">
            {isLoading ? <Skeleton /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.salesSeries ?? []} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" minTickGap={24} />
                  <YAxis tickFormatter={compact} tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" width={44} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="sales" stroke="var(--accent)" strokeWidth={2} fill="url(#salesGrad)" animationDuration={600} />
                  {canProfit && <Area type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={1.5} fill="transparent" animationDuration={800} />}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold display mb-3">Sales by category</h2>
          <div className="h-64">
            {isLoading ? <Skeleton /> : (data?.categoryShare.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.categoryShare} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                    {data.categoryShare.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <Empty />)}
          </div>
          {data?.categoryShare.length ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
              {data.categoryShare.map((c, i) => (
                <span key={c.name} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{c.name}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <h2 className="font-semibold display mb-3">Top products (30 days)</h2>
          <div className="h-64">
            {isLoading ? <Skeleton /> : (data?.topProducts.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProducts} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickFormatter={compact} tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "var(--surface-2)" }} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />)}
          </div>
        </div>

        {can("reports.view") && (
          <div className="card p-5">
            <h2 className="font-semibold display mb-3">Receivables aging (udhaar by age)</h2>
            <div className="h-64">
              {agingData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" />
                    <YAxis tickFormatter={compact} tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" width={44} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "var(--surface-2)" }} />
                    <Bar dataKey="value" name="Receivable" radius={[4, 4, 0, 0]} animationDuration={600}>
                      {agingData.map((_, i) => <Cell key={i} fill={i >= 2 ? "var(--danger)" : "var(--accent)"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty label="No outstanding udhaar" />}
            </div>
          </div>
        )}
      </div>

      {/* Recent invoices + low-stock lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <h2 className="font-semibold display mb-3">Recent invoices</h2>
          {isLoading ? <div className="h-40"><Skeleton /></div> : (data?.recentSales.length ? (
            <div className="divide-y divide-edge -my-1">
              {data.recentSales.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0"><span className="mono">{s.invoiceNo}</span><span className="text-muted"> · {s.customer}</span></div>
                  <div className="text-right whitespace-nowrap">
                    <span className="money font-medium">{fmtMoney(s.grandTotal)}</span>
                    {num(s.dueAmount) > 0 && <span className="text-xs text-danger ml-2">due {fmtMoney(s.dueAmount)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-muted text-sm">No sales yet.</p>)}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold display mb-3 flex items-center gap-2"><PackageX size={16} className="text-accent" /> Low stock items</h2>
          {isLoading ? <div className="h-40"><Skeleton /></div> : (data?.lowStockItems.length ? (
            <div className="divide-y divide-edge -my-1">
              {data.lowStockItems.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="mono text-danger whitespace-nowrap">{p.stockQty} {p.unit} <span className="text-muted">· min {p.minStockLevel}</span></span>
                </div>
              ))}
            </div>
          ) : <p className="text-muted text-sm">All items are above their minimum. 👍</p>)}
        </div>
      </div>
    </div>
  );
}

const Skeleton = () => <div className="w-full h-full rounded-lg bg-surface-2 animate-pulse" />;
const Empty = ({ label = "No data yet" }: { label?: string }) => <div className="w-full h-full flex items-center justify-center text-muted text-sm">{label}</div>;
