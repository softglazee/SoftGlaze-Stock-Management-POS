import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Eye, Undo2, Printer, Truck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Sale, Paged } from "../lib/types";
import { num, fmtMoney, fmtQty } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Modal, EmptyState, TableSkeleton, SearchBox, Badge, Pagination, useToast } from "../components/ui";
import { printReceipt } from "../lib/receipt";
import DispatchModal from "../components/DispatchModal";

function statusBadge(s: Sale) {
  if (s.isReturn) return <Badge tone="warn">Return</Badge>;
  if (s.status === "COMPLETED") return <Badge tone="success">Completed</Badge>;
  if (s.status === "RETURNED") return <Badge tone="warn">Returned</Badge>;
  return <Badge tone="muted">{s.status}</Badge>;
}

export default function Sales() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Sale | null>(null);
  const canProfit = can("reports.profit");

  const params = new URLSearchParams({ page: String(page), limit: "20", ...(search.trim() && { search: search.trim() }), ...(status && { status }) });
  const { data, isLoading } = useQuery({
    queryKey: ["sales", page, search, status],
    queryFn: () => api<Paged<"sales", Sale> & { totalSales: string; totalDue: string; totalProfit?: string }>(`/sales?${params}`),
    placeholderData: keepPreviousData,
  });
  const sales = data?.sales ?? [];

  return (
    <div>
      <PageHeader
        title="Sales"
        sub={`Every invoice and return. Total sales: ${fmtMoney(data?.totalSales ?? 0)}${canProfit && data?.totalProfit != null ? ` · profit: ${fmtMoney(data.totalProfit)}` : ""}`}
      />

      <div className="flex flex-wrap gap-2 mb-3">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search invoice no…" />
        <select className="input !w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter">
          <option value="">All</option>
          <option value="COMPLETED">Completed</option>
          <option value="RETURNED">Returns</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton cols={7} />
        ) : sales.length === 0 ? (
          <EmptyState title={search ? "No sales match" : "No sales yet"} hint={search ? "Try a different search." : "Make your first sale from the POS screen."} />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-edge">
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total</th>
                  <th className="px-4 py-2.5 font-medium text-right">Due</th>
                  {canProfit && <th className="px-4 py-2.5 font-medium text-right">Profit</th>}
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="border-b border-edge last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-2 mono">{s.invoiceNo}</td>
                    <td className="px-4 py-2 text-muted whitespace-nowrap">{new Date(s.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{s.customer?.name ?? <span className="text-muted">Walk-in</span>}</td>
                    <td className="px-4 py-2 text-right money">{fmtMoney(s.grandTotal)}</td>
                    <td className={`px-4 py-2 text-right money ${num(s.dueAmount) > 0 ? "text-danger" : ""}`}>{fmtMoney(s.dueAmount)}</td>
                    {canProfit && <td className="px-4 py-2 text-right money text-muted">{s.profit != null ? fmtMoney(s.profit) : "—"}</td>}
                    <td className="px-4 py-2">{statusBadge(s)}</td>
                    <td className="px-4 py-2"><button className="btn btn-secondary !p-1.5" onClick={() => setViewing(s)} title="View"><Eye size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onPage={setPage} />
          </>
        )}
      </div>

      {viewing && <ViewSale sale={viewing} onClose={() => setViewing(null)} onReturned={() => { qc.invalidateQueries({ queryKey: ["sales"] }); setViewing(null); }} />}
    </div>
  );
}
// (helper components below)

function ViewSale({ sale, onClose, onReturned }: { sale: Sale; onClose: () => void; onReturned: () => void }) {
  const { toast } = useToast();
  const { can } = useAuth();
  const { data } = useQuery({ queryKey: ["sale", sale.id], queryFn: () => api<{ sale: Sale }>(`/sales/${sale.id}`) });
  const { data: settingsData } = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: Record<string, string> }>("/settings") });
  const s = data?.sale ?? sale;
  const [returnMode, setReturnMode] = useState(false);
  const [retQty, setRetQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [dispatch, setDispatch] = useState(false);

  const doReturn = useMutation({
    mutationFn: () => {
      const items = Object.entries(retQty).map(([saleItemId, q]) => ({ saleItemId, qty: Number(q) || 0 })).filter((i) => i.qty > 0);
      return api<{ sale: Sale }>(`/sales/${s.id}/return`, { method: "POST", body: { items } });
    },
    onSuccess: (d) => { toast(`Return ${d.sale.invoiceNo} saved`); onReturned(); },
    onError: (e: ApiError) => setError(e.message),
  });

  const canReturn = can("sales.return") && !s.isReturn && s.status === "COMPLETED";
  const anyRet = Object.values(retQty).some((q) => (Number(q) || 0) > 0);

  return (
    <Modal open onClose={onClose} title={`${s.isReturn ? "Return " : "Invoice "}${s.invoiceNo}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div><span className="text-muted">Customer:</span> {s.customer?.name ?? "Walk-in"}</div>
          <div><span className="text-muted">Date:</span> {new Date(s.date).toLocaleString()}</div>
          <div><span className="text-muted">By:</span> {s.user?.name}</div>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-edge text-xs">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Price</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                {returnMode && <th className="px-3 py-2 font-medium text-right w-28">Return qty</th>}
              </tr>
            </thead>
            <tbody>
              {s.items.map((it) => (
                <tr key={it.id} className="border-b border-edge last:border-0">
                  <td className="px-3 py-1.5">{it.product?.name} <span className="mono text-muted text-xs">{it.product?.sku}</span></td>
                  <td className="px-3 py-1.5 text-right mono">{fmtQty(it.qty)} {it.product?.unit?.shortName}</td>
                  <td className="px-3 py-1.5 text-right money">{fmtMoney(it.unitPrice)}</td>
                  <td className="px-3 py-1.5 text-right money">{fmtMoney(it.total)}</td>
                  {returnMode && (
                    <td className="px-3 py-1.5"><input className="input mono !py-1 text-right" type="number" step="any" min="0" max={num(it.qty)} value={retQty[it.id] ?? ""} onChange={(e) => setRetQty({ ...retQty, [it.id]: e.target.value })} /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div><span className="text-muted">Grand total</span><div className="money font-semibold">{fmtMoney(s.grandTotal)}</div></div>
          <div><span className="text-muted">Paid</span><div className="money">{fmtMoney(s.paidAmount)}</div></div>
          <div><span className="text-muted">Due</span><div className={`money ${num(s.dueAmount) > 0 ? "text-danger" : ""}`}>{fmtMoney(s.dueAmount)}</div></div>
          {s.profit != null && <div><span className="text-muted">Profit</span><div className="money">{fmtMoney(s.profit)}</div></div>}
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          {!returnMode && <button className="btn btn-secondary" onClick={() => printReceipt(s, "80mm", settingsData?.settings ?? {})}><Printer size={15} /> 80mm</button>}
          {!returnMode && <button className="btn btn-secondary" onClick={() => printReceipt(s, "a4", settingsData?.settings ?? {})}><Printer size={15} /> A4 / PDF</button>}
          {!returnMode && !s.isReturn && s.status === "COMPLETED" && can("sales.create") && <button className="btn btn-secondary" onClick={() => setDispatch(true)}><Truck size={15} /> Dispatch / Challan</button>}
          {canReturn && !returnMode && <button className="btn btn-secondary" onClick={() => setReturnMode(true)}><Undo2 size={15} /> Return items</button>}
          {returnMode && (
            <>
              <button className="btn btn-secondary" onClick={() => { setReturnMode(false); setRetQty({}); }}>Cancel return</button>
              <button className="btn btn-danger" disabled={!anyRet || doReturn.isPending} onClick={() => doReturn.mutate()}>{doReturn.isPending ? "Saving…" : "Confirm return"}</button>
            </>
          )}
          {!returnMode && <button className="btn btn-secondary" onClick={onClose}>Close</button>}
        </div>
      </div>
      {dispatch && <DispatchModal sale={s} onClose={() => setDispatch(false)} />}
    </Modal>
  );
}
