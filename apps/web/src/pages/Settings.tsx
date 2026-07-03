import { useState, useRef, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Store, Boxes, ShieldCheck, Plug, DatabaseBackup, ScrollText, Upload, Trash2, Image as ImageIcon, Send, RotateCcw, Download, AlertTriangle } from "lucide-react";
import { api, download, ApiError } from "../lib/api";
import { BusinessPresetInfo, PermissionMatrix, AuditLogEntry, Paged } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { PageHeader, TableSkeleton, EmptyState, Pagination, ConfirmDialog, useToast } from "../components/ui";

type Tab = { key: string; label: string; icon: typeof Store; perm?: string; superOnly?: boolean };
const TABS: Tab[] = [
  { key: "profile", label: "Shop Profile", icon: Store, perm: "settings.shop" },
  { key: "business", label: "Business Type", icon: Boxes, superOnly: true },
  { key: "permissions", label: "Roles & Permissions", icon: ShieldCheck, superOnly: true },
  { key: "integrations", label: "Integrations", icon: Plug, perm: "settings.integrations" },
  { key: "backup", label: "Backup", icon: DatabaseBackup, perm: "backup.manage" },
  { key: "audit", label: "Audit Log", icon: ScrollText, perm: "audit.view" },
];

export default function Settings() {
  const { can, user } = useAuth();
  const allowed = TABS.filter((t) => (t.superOnly ? user?.role === "SUPER_ADMIN" : t.perm ? can(t.perm) : true));
  const [tab, setTab] = useState(allowed[0]?.key ?? "profile");

  return (
    <div>
      <PageHeader title="Settings" sub="Shop profile, staff permissions, integrations and backups." />
      <div className="flex gap-1 mb-4 border-b border-edge overflow-x-auto">
        {allowed.map((t) => (
          <button key={t.key} className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? "border-accent text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab />}
      {tab === "business" && <BusinessTab />}
      {tab === "permissions" && <PermissionsTab />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "backup" && <BackupTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

const FIELDS: { key: string; label: string; ph?: string; area?: boolean }[][] = [
  [{ key: "shop_name", label: "Shop name" }, { key: "shop_tagline", label: "Tagline" }],
  [{ key: "shop_address", label: "Address" }, { key: "shop_city", label: "City" }],
  [{ key: "shop_phone", label: "Phone" }, { key: "shop_phone2", label: "Phone 2" }],
  [{ key: "shop_whatsapp", label: "WhatsApp number", ph: "923001234567" }, { key: "shop_email", label: "Email" }],
  [{ key: "tax_number", label: "Tax / NTN" }, { key: "strn", label: "STRN" }],
  [{ key: "currency_symbol", label: "Currency symbol", ph: "₨" }, { key: "tax_percent", label: "Default tax %" }],
  [{ key: "invoice_header_lines", label: "Invoice header lines", area: true }, { key: "invoice_footer", label: "Invoice footer / terms", area: true }],
];

function ProfileTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const logoRef = useRef<HTMLInputElement>(null);
  const favRef = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: Record<string, string> }>("/settings") });
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setForm(data.settings); }, [data]);
  const s = { ...data?.settings, ...form };

  const save = useMutation({
    mutationFn: () => { const body: Record<string, string> = {}; FIELDS.flat().forEach((f) => { body[f.key] = form[f.key] ?? ""; }); body.receipt_size = form.receipt_size ?? s.receipt_size ?? "80mm"; return api("/settings", { method: "PATCH", body }); },
    onSuccess: () => { toast("Shop profile saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: ApiError) => toast(e.message, "error"),
  });
  const uploadLogo = useMutation({ mutationFn: (file: File) => { const fd = new FormData(); fd.append("logo", file); return api("/settings/logo", { method: "POST", body: fd, isForm: true }); }, onSuccess: () => { toast("Logo updated"); qc.invalidateQueries({ queryKey: ["settings"] }); }, onError: (e: ApiError) => toast(e.message, "error") });
  const removeLogo = useMutation({ mutationFn: () => api("/settings/logo", { method: "DELETE" }), onSuccess: () => { toast("Logo removed"); qc.invalidateQueries({ queryKey: ["settings"] }); } });
  const uploadFav = useMutation({ mutationFn: (file: File) => { const fd = new FormData(); fd.append("favicon", file); return api("/settings/favicon", { method: "POST", body: fd, isForm: true }); }, onSuccess: () => { toast("Favicon updated"); qc.invalidateQueries({ queryKey: ["settings"] }); }, onError: (e: ApiError) => toast(e.message, "error") });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-4">
          {s.shop_logo ? <img src={s.shop_logo_thumb || s.shop_logo} alt="" className="w-16 h-16 rounded-lg object-cover border border-edge" /> : <div className="w-16 h-16 rounded-lg bg-surface-2 border border-edge flex items-center justify-center"><ImageIcon size={22} className="text-muted" /></div>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => logoRef.current?.click()}><Upload size={15} /> {uploadLogo.isPending ? "Uploading…" : "Logo"}</button>
            {s.shop_logo && <button className="btn btn-secondary hover:!text-danger" onClick={() => removeLogo.mutate()}><Trash2 size={15} /></button>}
            <button className="btn btn-secondary" onClick={() => favRef.current?.click()}><ImageIcon size={15} /> Favicon</button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo.mutate(e.target.files[0])} />
            <input ref={favRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFav.mutate(e.target.files[0])} />
          </div>
        </div>
        {FIELDS.map((row, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            {row.map((f) => (
              <div key={f.key} className={f.area ? "col-span-2" : ""}>
                <label className="label">{f.label}</label>
                {f.area ? <textarea className="input" rows={2} value={s[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.ph} /> : <input className="input" value={s[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.ph} />}
              </div>
            ))}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Default receipt size</label><select className="input" value={s.receipt_size ?? "80mm"} onChange={(e) => set("receipt_size", e.target.value)}><option value="80mm">80mm thermal</option><option value="a4">A4</option></select></div>
        </div>
        <div className="flex justify-end"><button className="btn btn-secondary !border-accent !text-accent" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save profile"}</button></div>
      </div>

      {/* Live invoice preview */}
      <div className="card p-5 h-max lg:sticky lg:top-4">
        <p className="text-xs text-muted mb-2">Invoice preview</p>
        <div className="border border-edge rounded-lg p-4 bg-surface-2 text-center text-sm">
          {s.shop_logo && <img src={s.shop_logo_thumb || s.shop_logo} alt="" className="h-10 mx-auto mb-1 object-contain" />}
          <p className="font-bold display text-base">{s.shop_name || "Your Shop"}</p>
          {s.shop_tagline && <p className="text-muted text-xs">{s.shop_tagline}</p>}
          {(s.shop_address || s.shop_city) && <p className="text-muted text-xs">{[s.shop_address, s.shop_city].filter(Boolean).join(", ")}</p>}
          {(s.shop_phone || s.shop_phone2) && <p className="text-muted text-xs mono">{[s.shop_phone, s.shop_phone2].filter(Boolean).join(" · ")}</p>}
          {s.tax_number && <p className="text-muted text-xs">NTN: {s.tax_number}</p>}
          <div className="border-t border-dashed border-edge my-2" />
          <p className="text-left text-xs">INV-000123 · {new Date().toLocaleDateString()}</p>
          <div className="border-t border-dashed border-edge my-2" />
          <p className="font-semibold">{s.currency_symbol || "₨"} 12,500.00</p>
          {s.invoice_footer && <p className="text-muted text-[11px] mt-2 whitespace-pre-wrap">{s.invoice_footer}</p>}
        </div>
      </div>
    </div>
  );
}

function BusinessTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["presets"], queryFn: () => api<{ presets: BusinessPresetInfo[] }>("/settings/presets") });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: Record<string, string> }>("/settings") });
  const current = settings?.settings.business_type;
  const [confirming, setConfirming] = useState<BusinessPresetInfo | null>(null);
  const apply = useMutation({
    mutationFn: (v: { type: string; force: boolean }) => api<{ preset: string }>("/settings/apply-preset", { method: "POST", body: v }),
    onSuccess: (d) => { toast(`Applied ${d.preset} starter data`); qc.invalidateQueries({ queryKey: ["settings"] }); setConfirming(null); },
    onError: (e: ApiError) => { toast(e.message, "error"); setConfirming(null); },
  });
  return (
    <div>
      <p className="text-sm text-muted mb-3">Applying a business type adds its starter categories, units and sample products. It never deletes your data.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.presets ?? []).map((p) => (
          <div key={p.key} className={`card p-4 ${current === p.key ? "!border-accent" : ""}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.label}</h3>{current === p.key && <span className="text-xs text-accent font-medium">Current</span>}</div>
            <p className="text-muted text-xs mt-1">{p.description}</p>
            <p className="text-muted text-[11px] mt-2">{p.categoryNames.slice(0, 5).join(", ")}{p.categoryNames.length > 5 ? "…" : ""}</p>
            <button className="btn btn-secondary w-full mt-3" onClick={() => setConfirming(p)}>{current === p.key ? "Re-apply starter data" : "Apply"}</button>
          </div>
        ))}
      </div>
      <ConfirmDialog open={confirming !== null} title={`Apply ${confirming?.label ?? ""}?`} message="This adds starter categories, units and sample products (won't remove anything). If you already have sales, it will still just add data." confirmLabel="Apply" busy={apply.isPending} onConfirm={() => confirming && apply.mutate({ type: confirming.key, force: true })} onClose={() => setConfirming(null)} />
    </div>
  );
}

function PermissionsTab() {
  const { toast } = useToast();
  const { data, refetch } = useQuery({ queryKey: ["matrix"], queryFn: () => api<PermissionMatrix>("/permissions/matrix") });
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  useEffect(() => { if (data) setMatrix(data.matrix); }, [data]);
  const save = useMutation({ mutationFn: () => api("/permissions/matrix", { method: "PUT", body: { matrix } }), onSuccess: () => { toast("Permissions saved"); refetch(); }, onError: (e: ApiError) => toast(e.message, "error") });
  const reset = useMutation({ mutationFn: (role: string) => api("/permissions/reset", { method: "POST", body: { role } }), onSuccess: () => { toast("Reset to defaults"); refetch(); }, onError: (e: ApiError) => toast(e.message, "error") });

  if (!data) return <div className="card"><TableSkeleton cols={5} /></div>;
  const roles = data.roles;
  const groups = [...new Set(data.permissions.map((p) => p.group))];
  const has = (role: string, key: string) => matrix[role]?.includes(key);
  const toggle = (role: string, key: string) => setMatrix((m) => ({ ...m, [role]: has(role, key) ? m[role].filter((k) => k !== key) : [...(m[role] ?? []), key] }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted">SUPER_ADMIN always has every permission and isn't shown. Tick what each role can do.</p>
        <button className="btn btn-secondary !border-accent !text-accent" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save permissions"}</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-edge"><th className="px-4 py-2.5 text-left font-medium text-muted">Permission</th>{roles.map((r) => <th key={r} className="px-3 py-2.5 text-center font-medium text-muted">{r}</th>)}</tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="bg-surface-2/40"><td colSpan={roles.length + 1} className="px-4 py-1.5 text-xs font-semibold text-muted uppercase tracking-wide">{g}</td></tr>
                {data.permissions.filter((p) => p.group === g).map((p) => (
                  <tr key={p.key} className="border-b border-edge last:border-0">
                    <td className="px-4 py-2">{p.label} <span className="mono text-[10px] text-muted">{p.key}</span></td>
                    {roles.map((r) => <td key={r} className="px-3 py-2 text-center"><input type="checkbox" checked={!!has(r, p.key)} onChange={() => toggle(r, p.key)} className="w-4 h-4 accent-[var(--accent)]" /></td>)}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => <button key={r} className="btn btn-secondary !text-xs" onClick={() => reset.mutate(r)}><RotateCcw size={12} /> Reset {r}</button>)}
      </div>
    </div>
  );
}

const WA_TEMPLATES = [
  { key: "tmpl_wa_receipt", label: "Sale receipt", def: "*{shop}*\nInvoice {invoice} — Total {total}\nPaid {paid} · Balance {due}\nThank you!" },
  { key: "tmpl_wa_reminder", label: "Debt reminder", def: "Dear {customer}, your balance at *{shop}* is {due}. Kindly clear it soon. Thank you." },
];
const PLACEHOLDERS = ["{shop}", "{customer}", "{invoice}", "{total}", "{paid}", "{due}", "{date}"];

function IntegrationsTab() {
  const { toast } = useToast();
  const { data, refetch } = useQuery({ queryKey: ["integrations"], queryFn: () => api<{ settings: Record<string, string> }>("/settings/integrations") });
  const [form, setForm] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState("");
  useEffect(() => { if (data) setForm(data.settings); }, [data]);
  const s = { ...data?.settings, ...form };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({ mutationFn: () => api("/settings/integrations", { method: "PATCH", body: form }), onSuccess: () => { toast("Integrations saved"); refetch(); }, onError: (e: ApiError) => toast(e.message, "error") });
  const test = useMutation({ mutationFn: () => api<{ message: string }>("/settings/test-email", { method: "POST", body: { to: testTo } }), onSuccess: (d) => toast(d.message), onError: (e: ApiError) => toast(e.message, "error") });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold display flex items-center gap-2"><Send size={16} /> WhatsApp (wa.me)</h3>
        <p className="text-xs text-muted">Free deep links — no approval needed. Staff tap "Send on WhatsApp" on a sale or a customer's ledger.</p>
        <div><label className="label">Mode</label><select className="input" value={s.whatsapp_mode ?? "walink"} onChange={(e) => set("whatsapp_mode", e.target.value)}><option value="walink">wa.me links (on)</option><option value="off">Off</option></select></div>
        {WA_TEMPLATES.map((t) => (
          <div key={t.key}>
            <label className="label">{t.label} template</label>
            <textarea className="input mono text-xs" rows={3} value={s[t.key] ?? t.def} onChange={(e) => set(t.key, e.target.value)} />
          </div>
        ))}
        <div className="flex flex-wrap gap-1">{PLACEHOLDERS.map((p) => <span key={p} className="text-[10px] mono px-1.5 py-0.5 rounded bg-surface-2 border border-edge text-muted">{p}</span>)}</div>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold display flex items-center gap-2"><Plug size={16} /> Email (SMTP)</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Host</label><input className="input" value={s.smtp_host ?? ""} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.gmail.com" /></div>
          <div><label className="label">Port</label><input className="input mono" value={s.smtp_port ?? "587"} onChange={(e) => set("smtp_port", e.target.value)} /></div>
          <div><label className="label">Username</label><input className="input" value={s.smtp_user ?? ""} onChange={(e) => set("smtp_user", e.target.value)} /></div>
          <div><label className="label">Password {s.smtp_pass_set === "1" && <span className="text-success text-[10px]">(saved)</span>}</label><input className="input" type="password" value={form.smtp_pass ?? ""} onChange={(e) => set("smtp_pass", e.target.value)} placeholder={s.smtp_pass_set === "1" ? "•••••• (leave blank to keep)" : ""} /></div>
          <div><label className="label">From name</label><input className="input" value={s.smtp_from_name ?? ""} onChange={(e) => set("smtp_from_name", e.target.value)} /></div>
          <div><label className="label">Secure (SSL)</label><select className="input" value={s.smtp_secure ?? "0"} onChange={(e) => set("smtp_secure", e.target.value)}><option value="0">No (STARTTLS)</option><option value="1">Yes (465)</option></select></div>
        </div>
        <div className="flex gap-2 items-end pt-1">
          <div className="flex-1"><label className="label">Test recipient</label><input className="input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></div>
          <button className="btn btn-secondary" onClick={() => test.mutate()} disabled={test.isPending || !testTo}><Send size={15} /> {test.isPending ? "Sending…" : "Test"}</button>
        </div>
        <div className="border-t border-edge pt-3 space-y-2">
          <p className="text-xs text-muted">Email templates — same {"{placeholders}"} as WhatsApp.</p>
          <div><label className="label">Receipt subject</label><input className="input" value={s.tmpl_email_subject ?? "Invoice {invoice} from {shop}"} onChange={(e) => set("tmpl_email_subject", e.target.value)} /></div>
          <div><label className="label">Receipt body</label><textarea className="input mono text-xs" rows={3} value={s.tmpl_email_body ?? "Dear {customer},\n\nYour invoice {invoice} total is {total} (paid {paid}, balance {due}).\n\nThank you,\n{shop}"} onChange={(e) => set("tmpl_email_body", e.target.value)} /></div>
          <div><label className="label">Reminder subject</label><input className="input" value={s.tmpl_email_reminder_subject ?? "Payment reminder from {shop}"} onChange={(e) => set("tmpl_email_reminder_subject", e.target.value)} /></div>
          <div><label className="label">Reminder body</label><textarea className="input mono text-xs" rows={3} value={s.tmpl_email_reminder_body ?? "Dear {customer},\n\nYour balance at {shop} is {due}. Kindly clear it soon.\n\nThank you."} onChange={(e) => set("tmpl_email_reminder_body", e.target.value)} /></div>
        </div>
      </div>

      <div className="lg:col-span-2 flex justify-end"><button className="btn btn-secondary !border-accent !text-accent" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save integrations"}</button></div>
    </div>
  );
}

function BackupTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ["backup-summary"], queryFn: () => api<{ counts: Record<string, number> }>("/backup/summary") });
  const [pending, setPending] = useState<any | null>(null);
  const restore = useMutation({
    mutationFn: (snap: any) => api<{ message: string }>("/backup/restore", { method: "POST", body: snap }),
    onSuccess: (d) => { toast(d.message); setPending(null); qc.invalidateQueries(); },
    onError: (e: ApiError) => { toast(e.message, "error"); setPending(null); },
  });

  async function onFile(file: File) {
    try { const snap = JSON.parse(await file.text()); if (snap.app !== "SoftGlaze") return toast("Not a SoftGlaze backup file", "error"); setPending(snap); }
    catch { toast("Couldn't read that file", "error"); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold display flex items-center gap-2"><Download size={16} /> Download backup</h3>
        <p className="text-sm text-muted">Save a full snapshot of everything — products, sales, customers, money, settings — as one file. Keep it somewhere safe.</p>
        {data && <p className="text-xs text-muted">Contains: {data.counts.sale} sales · {data.counts.purchase} purchases · {data.counts.product} products · {data.counts.customer} customers · {data.counts.user} users</p>}
        <button className="btn btn-secondary !border-accent !text-accent" onClick={() => download("/backup/export", "softglaze-backup.json").catch(() => toast("Download failed", "error"))}><Download size={15} /> Download backup file</button>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold display flex items-center gap-2 text-danger"><AlertTriangle size={16} /> Restore</h3>
        <p className="text-sm text-muted">Load a backup file. This <b className="text-danger">replaces ALL current data</b> with the backup. Use only to recover.</p>
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose backup file…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>

      <ConfirmDialog open={pending !== null} title="Restore this backup?" message="Everything currently in the system will be wiped and replaced with the backup. This cannot be undone. You may need to log in again afterwards." confirmLabel="Wipe & restore" busy={restore.isPending} onConfirm={() => pending && restore.mutate(pending)} onClose={() => setPending(null)} />
    </div>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const params = new URLSearchParams({ page: String(page), limit: "30", ...(action && { action }) });
  const { data, isLoading } = useQuery({ queryKey: ["audit", page, action], queryFn: () => api<Paged<"logs", AuditLogEntry> & { actions: string[] }>(`/audit?${params}`), placeholderData: keepPreviousData });
  const logs = data?.logs ?? [];
  return (
    <div className="space-y-3">
      <select className="input !w-56" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{(data?.actions ?? []).map((a) => <option key={a} value={a}>{a}</option>)}</select>
      <div className="card overflow-hidden">
        {isLoading ? <TableSkeleton cols={4} /> : logs.length === 0 ? <EmptyState title="No audit entries" /> : (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted border-b border-edge"><th className="px-4 py-2.5 font-medium">When</th><th className="px-4 py-2.5 font-medium">Who</th><th className="px-4 py-2.5 font-medium">Action</th><th className="px-4 py-2.5 font-medium">Details</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-edge last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-2 text-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2">{l.user?.name ?? "—"}</td>
                    <td className="px-4 py-2 mono text-xs">{l.action}</td>
                    <td className="px-4 py-2 text-muted truncate max-w-sm">{l.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
