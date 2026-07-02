import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, IdCard, HandCoins, Camera, History, CalendarDays, Building2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Employee, SalaryPayment, Department, Shift, Holiday, LeaveRequest, Account } from "../lib/types";
import { num, fmtMoney } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Modal, ConfirmDialog, EmptyState, TableSkeleton, SearchBox, Badge, useToast } from "../components/ui";

type Tab = "staff" | "salaries" | "hr";

export default function Employees() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("staff");
  return (
    <div>
      <PageHeader title="Employees & Salaries" sub="Staff profiles, monthly salary payments (auto-recorded as expenses), and simple HR." />
      <div className="flex gap-1 mb-4 border-b border-edge">
        {([["staff", "Staff", IdCard], ["salaries", "Salaries", HandCoins], ["hr", "HR", CalendarDays]] as [Tab, string, typeof IdCard][]).map(([key, label, Icon]) => (
          <button key={key} className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${tab === key ? "border-accent text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`} onClick={() => setTab(key)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === "staff" && <StaffTab can={can} />}
      {tab === "salaries" && <SalariesTab can={can} />}
      {tab === "hr" && <HRTab can={can} />}
    </div>
  );
}

/* ───────────── Staff ───────────── */

function StaffTab({ can }: { can: (...k: string[]) => boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [paying, setPaying] = useState<Employee | null>(null);
  const [history, setHistory] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["employees", search], queryFn: () => api<{ employees: Employee[] }>(`/employees?status=active${search ? `&search=${encodeURIComponent(search)}` : ""}`) });
  const employees = data?.employees ?? [];
  const manage = can("employees.manage");

  const remove = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/employees/${id}`, { method: "DELETE" }),
    onSuccess: (d) => { toast(d.message); qc.invalidateQueries({ queryKey: ["employees"] }); setDeleting(null); },
    onError: (e: ApiError) => { toast(e.message, "error"); setDeleting(null); },
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name / code…" />
        <div className="flex-1" />
        {manage && <button className="btn btn-secondary !border-accent !text-accent" onClick={() => setEditing("new")}><Plus size={16} /> Add employee</button>}
      </div>

      {isLoading ? (
        <div className="card"><TableSkeleton cols={3} /></div>
      ) : employees.length === 0 ? (
        <div className="card"><EmptyState title={search ? "No staff match" : "No employees yet"} hint={search ? "Try another search." : "Add your salesmen, loaders and drivers here."} /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((e) => (
            <div key={e.id} className="card p-4">
              <div className="flex items-start gap-3">
                {e.photo ? <img src={e.photo} alt="" className="w-12 h-12 rounded-full object-cover border border-edge" /> : <div className="w-12 h-12 rounded-full bg-surface-2 border border-edge flex items-center justify-center"><IdCard size={20} className="text-muted" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{e.name}</p>
                  <p className="text-xs text-muted">{e.code}{e.designation ? ` · ${e.designation}` : ""}</p>
                  <p className="text-sm money mt-0.5">{fmtMoney(e.baseSalary)}<span className="text-muted text-xs"> /month</span></p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {can("salary.pay") && <button className="btn btn-secondary !py-1 !text-xs !border-accent !text-accent" onClick={() => setPaying(e)}><HandCoins size={13} /> Pay salary</button>}
                <button className="btn btn-secondary !py-1 !text-xs" onClick={() => setHistory(e)}><History size={13} /> History</button>
                {manage && <button className="btn btn-secondary !p-1.5" title="Edit" onClick={() => setEditing(e)}><Pencil size={13} /></button>}
                {manage && <button className="btn btn-secondary !p-1.5 hover:!text-danger" title="Remove" onClick={() => setDeleting(e)}><Trash2 size={13} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && <EmployeeForm employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["employees"] }); setEditing(null); }} />}
      {paying && <PaySalaryModal employee={paying} onClose={() => setPaying(null)} onDone={(m) => { toast(m); qc.invalidateQueries({ queryKey: ["employees"] }); qc.invalidateQueries({ queryKey: ["salaries"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); setPaying(null); }} />}
      {history && <SalaryHistoryModal employee={history} onClose={() => setHistory(null)} />}
      <ConfirmDialog open={deleting !== null} title={`Remove ${deleting?.name ?? ""}?`} message="Staff with salary history are deactivated so their records stay on file." busy={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} onClose={() => setDeleting(null)} />
    </div>
  );
}

function EmployeeForm({ employee, onClose, onSaved }: { employee: Employee | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: depData } = useQuery({ queryKey: ["departments"], queryFn: () => api<{ departments: Department[] }>("/hr/departments") });
  const { data: shiftData } = useQuery({ queryKey: ["shifts"], queryFn: () => api<{ shifts: Shift[] }>("/hr/shifts") });
  const [form, setForm] = useState({
    name: employee?.name ?? "", phone: employee?.phone ?? "", cnic: employee?.cnic ?? "", address: employee?.address ?? "",
    designation: employee?.designation ?? "", departmentId: employee?.departmentId ?? "", shiftId: employee?.shiftId ?? "",
    baseSalary: String(num(employee?.baseSalary)), notes: employee?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, phone: form.phone || null, cnic: form.cnic || null, address: form.address || null, designation: form.designation || null, departmentId: form.departmentId || null, shiftId: form.shiftId || null, baseSalary: Number(form.baseSalary) || 0, notes: form.notes || null };
      return employee ? api<{ employee: Employee }>(`/employees/${employee.id}`, { method: "PATCH", body }) : api<{ employee: Employee }>("/employees", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (e: ApiError) => setError(e.message),
  });
  const photo = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append("image", file); return api(`/employees/${employee!.id}/photo`, { method: "POST", body: fd, isForm: true }); },
    onSuccess: () => { toast("Photo updated"); onSaved(); },
    onError: (e: ApiError) => toast(e.message, "error"),
  });
  return (
    <Modal open onClose={onClose} title={employee ? `Edit ${employee.name}` : "Add employee"} wide>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }} className="space-y-4">
        {employee && (
          <div className="flex items-center gap-3">
            {employee.photo ? <img src={employee.photo} alt="" className="w-14 h-14 rounded-full object-cover border border-edge" /> : <div className="w-14 h-14 rounded-full bg-surface-2 border border-edge flex items-center justify-center"><IdCard size={22} className="text-muted" /></div>}
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Camera size={15} /> {photo.isPending ? "Uploading…" : "Photo"}</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></div>
          <div><label className="label">Designation</label><input className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Salesman / Loader" /></div>
          <div><label className="label">Phone</label><input className="input mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">CNIC</label><input className="input mono" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></div>
          <div><label className="label">Department</label><select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}><option value="">—</option>{(depData?.departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div><label className="label">Shift</label><select className="input" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}><option value="">—</option>{(shiftData?.shifts ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="label">Base salary (monthly)</label><input className="input mono" type="number" step="0.01" min="0" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} /></div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>
        <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-secondary !border-accent !text-accent" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button></div>
      </form>
    </Modal>
  );
}

function PaySalaryModal({ employee, onClose, onDone }: { employee: Employee; onClose: () => void; onDone: (m: string) => void }) {
  const { data: accData } = useQuery({ queryKey: ["accounts"], queryFn: () => api<{ accounts: Account[] }>("/accounts") });
  const accounts = (accData?.accounts ?? []).filter((a) => a.isActive);
  const now = new Date();
  const [form, setForm] = useState({ month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, bonus: "0", deduction: "0", methodId: "", date: now.toISOString().slice(0, 10) });
  const [error, setError] = useState<string | null>(null);
  const methodId = form.methodId || accounts.find((a) => a.isCash)?.id || accounts[0]?.id || "";
  const net = num(employee.baseSalary) + Number(form.bonus || 0) - Number(form.deduction || 0);
  const save = useMutation({
    mutationFn: () => api<{ salary: { refNo: string } }>(`/employees/${employee.id}/salary`, { method: "POST", body: { month: form.month, methodId, bonus: Number(form.bonus) || 0, deduction: Number(form.deduction) || 0, date: form.date } }),
    onSuccess: (d) => onDone(`Salary ${d.salary.refNo} paid`),
    onError: (e: ApiError) => setError(e.message),
  });
  return (
    <Modal open onClose={onClose} title={`Pay salary — ${employee.name}`}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Month</label><input className="input mono" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></div>
          <div><label className="label">Base salary</label><input className="input mono" value={fmtMoney(employee.baseSalary)} disabled /></div>
          <div><label className="label">Bonus</label><input className="input mono" type="number" step="0.01" min="0" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
          <div><label className="label">Deduction (advance)</label><input className="input mono" type="number" step="0.01" min="0" value={form.deduction} onChange={(e) => setForm({ ...form, deduction: e.target.value })} /></div>
          <div><label className="label">Paid from</label><select className="input" value={methodId} onChange={(e) => setForm({ ...form, methodId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <div className="card p-3 flex justify-between items-center"><span className="text-sm text-muted">Net pay</span><span className="text-lg font-bold money text-accent">{fmtMoney(net)}</span></div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-secondary !border-accent !text-accent" disabled={save.isPending || net <= 0}>{save.isPending ? "Paying…" : "Pay salary"}</button></div>
      </form>
    </Modal>
  );
}

function SalaryHistoryModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["employee", employee.id], queryFn: () => api<{ employee: Employee }>(`/employees/${employee.id}`) });
  const salaries = data?.employee.salaries ?? [];
  return (
    <Modal open onClose={onClose} title={`Salary history — ${employee.name}`} wide>
      {salaries.length === 0 ? <EmptyState title="No salaries paid yet" /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted border-b border-edge text-xs"><th className="px-3 py-2 font-medium">Ref</th><th className="px-3 py-2 font-medium">Month</th><th className="px-3 py-2 font-medium text-right">Base</th><th className="px-3 py-2 font-medium text-right">Bonus</th><th className="px-3 py-2 font-medium text-right">Deduction</th><th className="px-3 py-2 font-medium text-right">Net paid</th></tr></thead>
            <tbody>
              {salaries.map((s) => (
                <tr key={s.id} className="border-b border-edge last:border-0">
                  <td className="px-3 py-1.5 mono text-xs">{s.refNo}</td>
                  <td className="px-3 py-1.5">{s.month}</td>
                  <td className="px-3 py-1.5 text-right money">{fmtMoney(s.baseAmount)}</td>
                  <td className="px-3 py-1.5 text-right money">{fmtMoney(s.bonus)}</td>
                  <td className="px-3 py-1.5 text-right money">{fmtMoney(s.deduction)}</td>
                  <td className="px-3 py-1.5 text-right money font-semibold">{fmtMoney(s.netPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ───────────── Salaries tab ───────────── */

function SalariesTab({ can }: { can: (...k: string[]) => boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [month, setMonth] = useState("");
  const [deleting, setDeleting] = useState<SalaryPayment | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["salaries", month], queryFn: () => api<{ salaries: SalaryPayment[]; totalPaid: string }>(`/employees/salaries${month ? `?month=${month}` : ""}`) });
  const salaries = data?.salaries ?? [];
  const del = useMutation({
    mutationFn: (id: string) => api(`/employees/salaries/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast("Salary reversed"); qc.invalidateQueries({ queryKey: ["salaries"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); setDeleting(null); },
    onError: (e: ApiError) => { toast(e.message, "error"); setDeleting(null); },
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label">Month</label><input className="input mono !w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        {month && <button className="btn btn-secondary" onClick={() => setMonth("")}>Clear</button>}
        <div className="flex-1" />
        <div className="card px-4 py-2 flex items-center gap-3"><span className="text-muted text-sm">Total paid</span><span className="text-lg font-bold money">{fmtMoney(data?.totalPaid ?? 0)}</span></div>
      </div>
      <div className="card overflow-hidden">
        {isLoading ? <TableSkeleton cols={5} /> : salaries.length === 0 ? <EmptyState title="No salaries" hint="Pay a salary from the Staff tab." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted border-b border-edge"><th className="px-4 py-2.5 font-medium">Ref</th><th className="px-4 py-2.5 font-medium">Employee</th><th className="px-4 py-2.5 font-medium">Month</th><th className="px-4 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 font-medium text-right">Net paid</th><th className="px-4 py-2.5 w-12" /></tr></thead>
            <tbody>
              {salaries.map((s) => (
                <tr key={s.id} className="border-b border-edge last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-2 mono text-xs">{s.refNo}</td>
                  <td className="px-4 py-2">{s.employee?.name}</td>
                  <td className="px-4 py-2">{s.month}</td>
                  <td className="px-4 py-2 text-muted">{new Date(s.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right money font-semibold">{fmtMoney(s.netPaid)}</td>
                  <td className="px-4 py-2">{can("salary.pay") && <button className="btn btn-secondary !p-1.5 hover:!text-danger" title="Reverse" onClick={() => setDeleting(s)}><Trash2 size={13} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmDialog open={deleting !== null} title={`Reverse ${deleting?.refNo ?? ""}?`} message="This removes the salary, its expense and the cash movement. Use it to fix a mistake." confirmLabel="Reverse" busy={del.isPending} onConfirm={() => deleting && del.mutate(deleting.id)} onClose={() => setDeleting(null)} />
    </div>
  );
}

/* ───────────── HR tab (G6) ───────────── */

function HRTab({ can }: { can: (...k: string[]) => boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const manage = can("employees.manage");
  const { data: deps } = useQuery({ queryKey: ["departments"], queryFn: () => api<{ departments: Department[] }>("/hr/departments") });
  const { data: shifts } = useQuery({ queryKey: ["shifts"], queryFn: () => api<{ shifts: Shift[] }>("/hr/shifts") });
  const { data: holidays } = useQuery({ queryKey: ["holidays"], queryFn: () => api<{ holidays: Holiday[] }>("/hr/holidays") });
  const { data: leaves } = useQuery({ queryKey: ["leaves"], queryFn: () => api<{ leaves: LeaveRequest[] }>("/hr/leaves") });
  const { data: emps } = useQuery({ queryKey: ["employees", ""], queryFn: () => api<{ employees: Employee[] }>("/employees?status=active") });

  const [depName, setDepName] = useState("");
  const [shift, setShift] = useState({ name: "", startTime: "09:00", endTime: "18:00" });
  const [holiday, setHoliday] = useState({ date: "", name: "" });
  const [leave, setLeave] = useState({ employeeId: "", fromDate: "", toDate: "", type: "UNPAID", reason: "" });

  const err = (e: ApiError) => toast(e.message, "error");
  const addDep = useMutation({ mutationFn: () => api("/hr/departments", { method: "POST", body: { name: depName } }), onSuccess: () => { setDepName(""); qc.invalidateQueries({ queryKey: ["departments"] }); }, onError: err });
  const delDep = useMutation({ mutationFn: (id: string) => api(`/hr/departments/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }), onError: err });
  const addShift = useMutation({ mutationFn: () => api("/hr/shifts", { method: "POST", body: shift }), onSuccess: () => { setShift({ name: "", startTime: "09:00", endTime: "18:00" }); qc.invalidateQueries({ queryKey: ["shifts"] }); }, onError: err });
  const delShift = useMutation({ mutationFn: (id: string) => api(`/hr/shifts/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }), onError: err });
  const addHol = useMutation({ mutationFn: () => api("/hr/holidays", { method: "POST", body: holiday }), onSuccess: () => { setHoliday({ date: "", name: "" }); qc.invalidateQueries({ queryKey: ["holidays"] }); }, onError: err });
  const delHol = useMutation({ mutationFn: (id: string) => api(`/hr/holidays/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }), onError: err });
  const addLeave = useMutation({ mutationFn: () => api("/hr/leaves", { method: "POST", body: leave }), onSuccess: () => { setLeave({ employeeId: "", fromDate: "", toDate: "", type: "UNPAID", reason: "" }); qc.invalidateQueries({ queryKey: ["leaves"] }); }, onError: err });
  const setLeaveStatus = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/hr/leaves/${v.id}`, { method: "PATCH", body: { status: v.status } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["leaves"] }), onError: err });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Departments */}
      <div className="card p-4">
        <h3 className="font-semibold display mb-2 flex items-center gap-1.5"><Building2 size={16} /> Departments</h3>
        {manage && <form onSubmit={(e) => { e.preventDefault(); if (depName.trim()) addDep.mutate(); }} className="flex gap-2 mb-2"><input className="input" value={depName} onChange={(e) => setDepName(e.target.value)} placeholder="Sales / Warehouse" /><button className="btn btn-secondary"><Plus size={15} /></button></form>}
        <div className="divide-y divide-edge">{(deps?.departments ?? []).map((d) => <div key={d.id} className="flex justify-between items-center py-1.5 text-sm"><span>{d.name} <span className="text-muted text-xs">({d._count?.employees ?? 0})</span></span>{manage && <button className="btn btn-secondary !p-1 hover:!text-danger" onClick={() => delDep.mutate(d.id)}><Trash2 size={12} /></button>}</div>)}{!deps?.departments.length && <p className="text-muted text-sm py-2">None yet.</p>}</div>
      </div>

      {/* Shifts */}
      <div className="card p-4">
        <h3 className="font-semibold display mb-2 flex items-center gap-1.5"><Clock size={16} /> Shifts</h3>
        {manage && <form onSubmit={(e) => { e.preventDefault(); if (shift.name.trim()) addShift.mutate(); }} className="flex flex-wrap gap-2 mb-2"><input className="input flex-1 !min-w-24" value={shift.name} onChange={(e) => setShift({ ...shift, name: e.target.value })} placeholder="Morning" /><input className="input mono !w-24" type="time" value={shift.startTime} onChange={(e) => setShift({ ...shift, startTime: e.target.value })} /><input className="input mono !w-24" type="time" value={shift.endTime} onChange={(e) => setShift({ ...shift, endTime: e.target.value })} /><button className="btn btn-secondary"><Plus size={15} /></button></form>}
        <div className="divide-y divide-edge">{(shifts?.shifts ?? []).map((s) => <div key={s.id} className="flex justify-between items-center py-1.5 text-sm"><span>{s.name} <span className="text-muted mono text-xs">{s.startTime}–{s.endTime}</span></span>{manage && <button className="btn btn-secondary !p-1 hover:!text-danger" onClick={() => delShift.mutate(s.id)}><Trash2 size={12} /></button>}</div>)}{!shifts?.shifts.length && <p className="text-muted text-sm py-2">None yet.</p>}</div>
      </div>

      {/* Holidays */}
      <div className="card p-4">
        <h3 className="font-semibold display mb-2 flex items-center gap-1.5"><CalendarDays size={16} /> Holidays</h3>
        {manage && <form onSubmit={(e) => { e.preventDefault(); if (holiday.date && holiday.name.trim()) addHol.mutate(); }} className="flex flex-wrap gap-2 mb-2"><input className="input !w-40" type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} /><input className="input flex-1 !min-w-24" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} placeholder="Eid" /><button className="btn btn-secondary"><Plus size={15} /></button></form>}
        <div className="divide-y divide-edge">{(holidays?.holidays ?? []).map((h) => <div key={h.id} className="flex justify-between items-center py-1.5 text-sm"><span>{new Date(h.date).toLocaleDateString()} · {h.name}</span>{manage && <button className="btn btn-secondary !p-1 hover:!text-danger" onClick={() => delHol.mutate(h.id)}><Trash2 size={12} /></button>}</div>)}{!holidays?.holidays.length && <p className="text-muted text-sm py-2">None yet.</p>}</div>
      </div>

      {/* Leaves */}
      <div className="card p-4">
        <h3 className="font-semibold display mb-2 flex items-center gap-1.5"><CalendarDays size={16} /> Leave requests</h3>
        {manage && (
          <form onSubmit={(e) => { e.preventDefault(); if (leave.employeeId && leave.fromDate && leave.toDate) addLeave.mutate(); }} className="grid grid-cols-2 gap-2 mb-2">
            <select className="input col-span-2" value={leave.employeeId} onChange={(e) => setLeave({ ...leave, employeeId: e.target.value })}><option value="">Pick employee…</option>{(emps?.employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <input className="input" type="date" value={leave.fromDate} onChange={(e) => setLeave({ ...leave, fromDate: e.target.value })} />
            <input className="input" type="date" value={leave.toDate} onChange={(e) => setLeave({ ...leave, toDate: e.target.value })} />
            <select className="input" value={leave.type} onChange={(e) => setLeave({ ...leave, type: e.target.value })}><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option><option value="SICK">Sick</option></select>
            <button className="btn btn-secondary"><Plus size={15} /> Request</button>
          </form>
        )}
        <div className="divide-y divide-edge max-h-56 overflow-y-auto">
          {(leaves?.leaves ?? []).map((l) => (
            <div key={l.id} className="flex justify-between items-center py-1.5 text-sm gap-2">
              <span className="min-w-0"><span className="font-medium">{l.employee?.name}</span> <span className="text-muted text-xs">{new Date(l.fromDate).toLocaleDateString()}→{new Date(l.toDate).toLocaleDateString()} · {l.days}d · {l.type}</span></span>
              <span className="flex items-center gap-1 shrink-0">
                {l.status === "PENDING" ? <Badge tone="warn">Pending</Badge> : l.status === "APPROVED" ? <Badge tone="success">Approved</Badge> : <Badge tone="danger">Rejected</Badge>}
                {manage && l.status === "PENDING" && <><button className="btn btn-secondary !p-1 hover:!text-success" title="Approve" onClick={() => setLeaveStatus.mutate({ id: l.id, status: "APPROVED" })}><CheckCircle2 size={13} /></button><button className="btn btn-secondary !p-1 hover:!text-danger" title="Reject" onClick={() => setLeaveStatus.mutate({ id: l.id, status: "REJECTED" })}><XCircle size={13} /></button></>}
              </span>
            </div>
          ))}
          {!leaves?.leaves.length && <p className="text-muted text-sm py-2">No leave requests.</p>}
        </div>
      </div>
    </div>
  );
}
