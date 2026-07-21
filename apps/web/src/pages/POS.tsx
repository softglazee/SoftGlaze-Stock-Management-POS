import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Plus, Trash2, UserPlus, ArrowLeft, Pause, FileText, CheckCircle2, Printer, Package } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Product, Customer, PaymentMethod, Sale } from "../lib/types";
import { num, fmtMoney, fmtQty } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useToast, Modal, Badge } from "../components/ui";
import ThemeToggle from "../components/ThemeToggle";
import Calculator from "../components/Calculator";
import { printReceipt } from "../lib/receipt";
import { waLink as buildWaLink } from "../lib/phone";

type Line = { productId: string; name: string; sku: string; type: Product["type"]; unitShort: string; qty: string; unitPrice: string; discount: string; stock: number };
type PayRow = { methodId: string; amount: string };
type SelCustomer = { id: string; name: string; phone: string | null; balance: string; creditLimit: string } | null;

export default function POS() {
  const { can } = useAuth();
  const { toast } = useToast();
  const canEditPrice = can("sales.discount_over_limit");

  const [cart, setCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<SelCustomer>(null);
  const [billDiscount, setBillDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [payTouched, setPayTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [success, setSuccess] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [showQuotes, setShowQuotes] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ name: string; phone: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: Record<string, string> }>("/settings") });
  const { data: methodData } = useQuery({ queryKey: ["payment-methods"], queryFn: () => api<{ methods: PaymentMethod[] }>("/payment-methods") });
  const { data: prodResults } = useQuery({
    queryKey: ["pos-prod", prodSearch],
    queryFn: () => api<{ products: Product[] }>(`/products/search?q=${encodeURIComponent(prodSearch)}`),
    enabled: prodSearch.trim().length > 0,
  });
  // Default catalog shown before searching — click any tile to add it.
  const { data: allProducts } = useQuery({ queryKey: ["pos-all-products"], queryFn: () => api<{ products: Product[] }>("/products?limit=100&status=active") });
  const methods = methodData?.methods ?? [];
  const cashMethodId = methods.find((m) => m.isCash)?.id ?? methods[0]?.id ?? "";

  const subTotal = cart.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) - (Number(l.discount) || 0), 0);
  const grand = Math.max(0, subTotal - (Number(billDiscount) || 0) + (Number(tax) || 0) + (Number(otherCharges) || 0));
  // A5 round-off: round the payable to the nearest N (setting) — server recomputes the same way.
  const roundTo = Number(settings?.settings.round_off_to || 0);
  const payable = roundTo > 0 ? Math.round(grand / roundTo) * roundTo : grand;
  const roundOff = Math.round((payable - grand) * 100) / 100;
  const paidSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const due = Math.max(0, payable - paidSum);
  const change = Math.max(0, paidSum - payable);
  // Grid shows search hits while typing, otherwise the whole active catalog.
  const shownProducts = prodSearch.trim() ? (prodResults?.products ?? []) : (allProducts?.products ?? []);

  // One default cash row that tracks the grand total until the cashier edits payments
  useEffect(() => {
    if (!cashMethodId) return;
    if (payments.length === 0) { setPayments([{ methodId: cashMethodId, amount: payable ? payable.toFixed(2) : "" }]); return; }
    if (!payTouched && payments.length === 1) setPayments([{ methodId: payments[0].methodId, amount: payable ? payable.toFixed(2) : "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payable, cashMethodId]);

  function addProduct(p: Product) {
    setProdSearch("");
    setCart((c) => {
      const found = c.find((l) => l.productId === p.id);
      if (found) return c.map((l) => (l.productId === p.id ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      return [...c, { productId: p.id, name: p.name, sku: p.sku, type: p.type, unitShort: p.unit?.shortName ?? "", qty: "1", unitPrice: String(num(p.salePrice)), discount: "0", stock: num(p.stockQty) }];
    });
    searchRef.current?.focus();
  }
  function setLine(i: number, patch: Partial<Line>) { setCart((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); }
  function removeLine(i: number) { setCart((c) => c.filter((_, idx) => idx !== i)); }
  function resetSale() {
    setCart([]); setCustomer(null); setBillDiscount("0"); setTax("0"); setOtherCharges("0");
    setPayments([]); setPayTouched(false); setNotes(""); setError(null); setSuccess(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  async function submit(status: "COMPLETED" | "DRAFT" | "QUOTATION", overrideCredit = false) {
    if (cart.length === 0) { setError("Cart is empty."); return; }
    setBusy(true); setError(null);
    // applied payments capped to the rounded payable (extra cash is change, not applied)
    let remaining = payable;
    const applied = status === "COMPLETED"
      ? payments.filter((p) => (Number(p.amount) || 0) > 0 && p.methodId).map((p) => {
          const amt = Math.min(Number(p.amount) || 0, remaining); remaining = Math.round((remaining - amt) * 100) / 100; return { methodId: p.methodId, amount: amt };
        }).filter((p) => p.amount > 0)
      : [];
    const body: Record<string, unknown> = {
      customerId: customer?.id ?? null,
      items: cart.map((l) => ({ productId: l.productId, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, discount: Number(l.discount) || 0 })),
      discount: Number(billDiscount) || 0, tax: Number(tax) || 0, otherCharges: Number(otherCharges) || 0,
      notes: notes || null, status, payments: applied, overrideCredit,
    };
    try {
      const { sale } = await api<{ sale: Sale }>("/sales", { method: "POST", body });
      if (status === "COMPLETED") { setSuccess(sale); }
      else { toast(status === "DRAFT" ? `Held as ${sale.invoiceNo}` : `Quotation ${sale.invoiceNo} saved`); resetSale(); }
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "CREDIT_LIMIT_EXCEEDED" && can("sales.discount_over_limit")) {
        if (window.confirm(`${err.message}\n\nProceed anyway (you have override permission)?`)) { setBusy(false); return submit(status, true); }
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  // Keyboard: F2 search · F6 hold · F9 focus pay · F10 complete · Esc close overlays
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "F10") { e.preventDefault(); if (!busy && cart.length && !success) submit("COMPLETED"); }
      else if (e.key === "F6") { e.preventDefault(); if (!busy && cart.length && !success) submit("DRAFT"); }
      else if (e.key === "Enter" && success) { e.preventDefault(); resetSale(); }
      else if (e.key === "Escape") { setShowHeld(false); setShowQuotes(false); setQuickAdd(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, cart, success, customer, payments, billDiscount, tax, otherCharges, notes]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  return (
    <div className="h-screen flex flex-col bg-app">
      {/* Top bar */}
      <header className="h-12 shrink-0 border-b border-edge flex items-center gap-3 px-3 bg-surface">
        <Link to="/" className="btn btn-secondary !p-2" title="Back to dashboard"><ArrowLeft size={16} /></Link>
        <span className="font-bold display">{settings?.settings.shop_name || "SoftGlaze"} · POS</span>
        <div className="flex-1" />
        <button className="btn btn-secondary !py-1.5" onClick={() => setShowHeld(true)}><Pause size={15} /> Held</button>
        <button className="btn btn-secondary !py-1.5" onClick={() => setShowQuotes(true)}><FileText size={15} /> Quotes</button>
        <ThemeToggle />
      </header>

      <div className="flex-1 grid lg:grid-cols-[1fr_420px] min-h-0">
        {/* Products */}
        <div className="flex flex-col min-h-0 border-r border-edge">
          <div className="p-3 border-b border-edge">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                className="input !pl-9"
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && prodResults?.products.length) { e.preventDefault(); addProduct(prodResults.products[0]); } }}
                placeholder="Search product by name / SKU / barcode  (F2)"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 xl:grid-cols-3 gap-2 content-start">
            {shownProducts.length === 0 ? (
              <div className="col-span-full text-center text-muted py-16">
                <Package size={28} className="mx-auto mb-2 opacity-60" />
                {prodSearch.trim() ? `No products match "${prodSearch}".` : "No products yet — add some under Products."}
              </div>
            ) : (
              shownProducts.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="card p-2.5 text-left hover:border-accent transition-colors flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {p.images?.[0] ? <img src={p.images[0].thumbPath ?? p.images[0].path} alt="" className="w-8 h-8 rounded object-cover border border-edge" /> : <span className="w-8 h-8 rounded bg-surface-2 border border-edge flex items-center justify-center"><Package size={14} className="text-muted" /></span>}
                    <span className="text-sm font-medium leading-tight line-clamp-2">{p.name}</span>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="money text-sm">{fmtMoney(p.salePrice)}</span>
                    {p.type === "STANDARD" ? (num(p.stockQty) <= 0 ? <Badge tone="danger">Out</Badge> : <span className="text-xs text-muted mono">{fmtQty(p.stockQty)} {p.unit?.shortName}</span>) : <Badge tone="muted">{p.type === "SERVICE" ? "Service" : "Combo"}</Badge>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Cart / checkout */}
        <div className="flex flex-col min-h-0 bg-surface">
          {/* Customer */}
          <div className="p-3 border-b border-edge">
            <CustomerBar customer={customer} onPick={setCustomer} onQuickAdd={() => setQuickAdd({ name: "", phone: "" })} />
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="text-center text-muted py-16 px-4">No items yet — search on the left and tap a product.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {cart.map((l, i) => (
                    <tr key={l.productId} className="border-b border-edge align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium leading-tight">{l.name}</div>
                        <div className="mono text-muted text-xs">{l.sku}{l.type !== "STANDARD" && ` · ${l.type.toLowerCase()}`}{l.type === "STANDARD" && num(l.qty) > l.stock && <span className="text-danger"> · only {l.stock} in stock</span>}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input className="input mono !py-1 !w-16 text-right" type="number" step="any" min="0" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Qty" />
                          <span className="text-muted text-xs">{l.unitShort} ×</span>
                          <input className="input mono !py-1 !w-24 text-right" type="number" step="0.01" min="0" value={l.unitPrice} readOnly={!canEditPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-label="Unit price" title={canEditPrice ? "" : "Price editing needs permission"} />
                          <span className="text-muted text-xs" title="Discount on this item">− </span>
                          <input className="input mono !py-1 !w-20 text-right" type="number" step="0.01" min="0" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} aria-label="Item discount" title="Discount on this item (Rs)" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="money font-medium">{fmtMoney((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) - (Number(l.discount) || 0))}</div>
                        <button className="text-muted hover:text-danger mt-1" onClick={() => removeLine(i)} aria-label="Remove line"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Totals + payment */}
          <div className="border-t border-edge p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <label className="text-muted">Discount<input className="input mono !py-1 text-right mt-0.5" type="number" step="0.01" min="0" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} /></label>
              <label className="text-muted">Tax<input className="input mono !py-1 text-right mt-0.5" type="number" step="0.01" min="0" value={tax} onChange={(e) => setTax(e.target.value)} /></label>
              <label className="text-muted">Delivery<input className="input mono !py-1 text-right mt-0.5" type="number" step="0.01" min="0" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} /></label>
            </div>
            {roundOff !== 0 && (
              <div className="flex items-center justify-between text-sm text-muted">
                <span>Round off</span><span className="money">{roundOff > 0 ? "+" : ""}{fmtMoney(roundOff)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Grand total</span><span className="money text-accent">{fmtMoney(payable)}</span>
            </div>

            {/* Payments */}
            <div className="space-y-1.5">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className="input !py-1 text-sm" value={p.methodId} onChange={(e) => { setPayTouched(true); setPayments(payments.map((x, idx) => idx === i ? { ...x, methodId: e.target.value } : x)); }}>
                    {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input className="input mono !py-1 !w-28 text-right" type="number" step="0.01" min="0" value={p.amount} onChange={(e) => { setPayTouched(true); setPayments(payments.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x)); }} aria-label="Amount" />
                  {payments.length > 1 && <button className="text-muted hover:text-danger" onClick={() => { setPayTouched(true); setPayments(payments.filter((_, idx) => idx !== i)); }}><X size={14} /></button>}
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs">
                <button className="text-accent" onClick={() => { setPayTouched(true); setPayments([...payments, { methodId: cashMethodId, amount: "" }]); }}>+ split payment</button>
                <button className="text-muted hover:text-ink" onClick={() => { setPayTouched(true); setPayments([{ methodId: cashMethodId, amount: "0" }]); }}>udhaar (pay later)</button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              {change > 0 ? <><span className="text-muted">Change to return</span><span className="money text-success">{fmtMoney(change)}</span></>
                : <><span className="text-muted">Balance (udhaar)</span><span className={`money ${due > 0 ? "text-danger" : ""}`}>{fmtMoney(due)}</span></>}
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button className="btn btn-secondary" disabled={busy || !cart.length} onClick={() => submit("DRAFT")} title="Hold (F6)"><Pause size={15} /> Hold</button>
              <button className="btn btn-secondary" disabled={busy || !cart.length} onClick={() => submit("QUOTATION")}><FileText size={15} /> Quote</button>
              <button className="btn btn-primary" disabled={busy || !cart.length} onClick={() => submit("COMPLETED")} title="Complete (F10)">{busy ? "…" : "Complete"}</button>
            </div>
          </div>
        </div>
      </div>

      {success && <SuccessOverlay sale={success} settings={settings?.settings ?? {}} onNew={resetSale} />}
      {showHeld && <ParkedTray kind="held" onClose={() => setShowHeld(false)} onResume={(s) => { loadSale(s); setShowHeld(false); }} />}
      {showQuotes && <ParkedTray kind="quotations" onClose={() => setShowQuotes(false)} onResume={(s) => { loadSale(s); setShowQuotes(false); }} />}
      {quickAdd && <QuickAddCustomer form={quickAdd} onClose={() => setQuickAdd(null)} onCreated={(c) => { setCustomer(c); setQuickAdd(null); }} />}
      <Calculator />
    </div>
  );

  function loadSale(s: Sale) {
    setCart(s.items.map((it) => ({ productId: it.productId, name: it.product?.name ?? "", sku: it.product?.sku ?? "", type: it.product?.type ?? "STANDARD", unitShort: it.product?.unit?.shortName ?? "", qty: String(num(it.qty)), unitPrice: String(num(it.unitPrice)), discount: String(num(it.discount)), stock: 0 })));
    setCustomer(s.customer ? { id: s.customer.id, name: s.customer.name, phone: s.customer.phone, balance: "0", creditLimit: "0" } : null);
    setBillDiscount(String(num(s.discount))); setTax(String(num(s.tax))); setOtherCharges(String(num(s.otherCharges)));
    setPayTouched(false); setPayments([]); setError(null);
    // remove the parked doc so it isn't double-counted
    api(`/sales/${s.id}`, { method: "DELETE" }).catch(() => {});
    toast(`Loaded ${s.invoiceNo}`);
  }
}

/* ─────────── Customer bar ─────────── */
function CustomerBar({ customer, onPick, onQuickAdd }: { customer: SelCustomer; onPick: (c: SelCustomer) => void; onQuickAdd: () => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["pos-cust", q], queryFn: () => api<{ customers: Customer[] }>(`/customers?search=${encodeURIComponent(q)}&limit=8`), enabled: q.trim().length > 0 });

  if (customer) {
    const bal = num(customer.balance); const limit = num(customer.creditLimit);
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{customer.name}</div>
          <div className="text-xs text-muted">
            {customer.phone && <span className="mono">{customer.phone}</span>}
            {bal !== 0 && <span className={bal > 0 ? "text-danger ml-2" : "text-success ml-2"}>bal {fmtMoney(customer.balance)}</span>}
            {limit > 0 && <span className="ml-2">limit {fmtMoney(customer.creditLimit)}</span>}
          </div>
        </div>
        <button className="btn btn-secondary !p-2" onClick={() => onPick(null)} title="Walk-in"><X size={15} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Walk-in — search customer by name / phone" />
        <button className="btn btn-secondary !p-2 shrink-0" onClick={onQuickAdd} title="Add new customer"><UserPlus size={16} /></button>
      </div>
      {q.trim() && (data?.customers.length ?? 0) > 0 && (
        <div className="absolute z-20 mt-1 w-full card max-h-56 overflow-y-auto">
          {data!.customers.map((c) => (
            <button key={c.id} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 flex justify-between" onClick={() => { onPick({ id: c.id, name: c.name, phone: c.phone, balance: c.balance, creditLimit: c.creditLimit }); setQ(""); }}>
              <span>{c.name} <span className="mono text-muted text-xs">{c.phone}</span></span>
              {num(c.balance) > 0 && <span className="text-danger text-xs">{fmtMoney(c.balance)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────── Quick-add customer ─────────── */
function QuickAddCustomer({ form, onClose, onCreated }: { form: { name: string; phone: string }; onClose: () => void; onCreated: (c: SelCustomer) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(form.name);
  const [phone, setPhone] = useState(form.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const { customer } = await api<{ customer: Customer }>("/customers", { method: "POST", body: { name, phone: phone || null } });
      toast(`${customer.name} added (${customer.code})`);
      onCreated({ id: customer.id, name: customer.name, phone: customer.phone, balance: customer.balance, creditLimit: customer.creditLimit });
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="New customer">
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div>
        <div><label className="label">Phone</label><input className="input mono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" /></div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Add & select"}</button></div>
      </form>
    </Modal>
  );
}

/* ─────────── Held / quotations tray ─────────── */
function ParkedTray({ kind, onClose, onResume }: { kind: "held" | "quotations"; onClose: () => void; onResume: (s: Sale) => void }) {
  const key = kind === "held" ? "held" : "quotations";
  const { data, isLoading } = useQuery({ queryKey: [`sales-${key}`], queryFn: () => api<Record<string, Sale[]>>(`/sales/${key}`) });
  const list = data?.[key] ?? [];
  return (
    <Modal open onClose={onClose} title={kind === "held" ? "Held bills" : "Quotations"} wide>
      {isLoading ? <p className="text-muted text-sm">Loading…</p> : list.length === 0 ? <p className="text-muted text-sm py-6 text-center">Nothing here yet.</p> : (
        <div className="space-y-2">
          {list.map((s) => (
            <button key={s.id} className="w-full card p-3 text-left hover:border-accent flex items-center justify-between" onClick={() => onResume(s)}>
              <div>
                <div className="font-medium mono">{s.invoiceNo}</div>
                <div className="text-xs text-muted">{s.customer?.name ?? "Walk-in"} · {s.items.length} items · {new Date(s.date).toLocaleString()}</div>
              </div>
              <span className="money font-semibold">{fmtMoney(s.grandTotal)}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ─────────── Success overlay ─────────── */
function SuccessOverlay({ sale, settings, onNew }: { sale: Sale; settings: Record<string, string>; onNew: () => void }) {
  const waLink = buildWaLink(
    sale.customer?.phone,
    `${settings.shop_name || "SoftGlaze"}\nInvoice ${sale.invoiceNo}\nTotal ${fmtMoney(sale.grandTotal)} · Paid ${fmtMoney(sale.paidAmount)} · Balance ${fmtMoney(sale.dueAmount)}\nThank you!`
  ) || null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <CheckCircle2 size={44} className="mx-auto text-success mb-2" />
        <h2 className="text-lg font-bold">Sale complete</h2>
        <p className="text-muted text-sm mono">{sale.invoiceNo}</p>
        <div className="my-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Grand total</span><span className="money font-semibold">{fmtMoney(sale.grandTotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Paid</span><span className="money">{fmtMoney(sale.paidAmount)}</span></div>
          {num(sale.dueAmount) > 0 && <div className="flex justify-between"><span className="text-muted">Balance (udhaar)</span><span className="money text-danger">{fmtMoney(sale.dueAmount)}</span></div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-secondary" onClick={() => printReceipt(sale, "80mm", settings)}><Printer size={15} /> 80mm</button>
          <button className="btn btn-secondary" onClick={() => printReceipt(sale, "a4", settings)}><Printer size={15} /> A4 / PDF</button>
          {waLink && <a className="btn btn-secondary col-span-2" href={waLink} target="_blank" rel="noreferrer">Send WhatsApp</a>}
          <button className="btn btn-primary col-span-2" onClick={onNew}><Plus size={15} /> New sale (Enter)</button>
        </div>
      </div>
    </div>
  );
}
