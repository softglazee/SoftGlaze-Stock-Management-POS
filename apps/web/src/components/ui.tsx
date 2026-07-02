/**
 * Shared UI primitives — Forge/Daylight design system (docs/06-UI-DESIGN-SYSTEM.md).
 * Toasts, Modal, ConfirmDialog, EmptyState, PageHeader, Badge, SearchBox,
 * TableSkeleton, Pagination. Amber stays reserved for money-critical actions.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { CheckCircle2, XCircle, X, Search, PackageOpen, ChevronLeft, ChevronRight } from "lucide-react";

/* ───────────────────────── Toasts ───────────────────────── */

type Toast = { id: number; tone: "success" | "error"; message: string };
const ToastContext = createContext<{ toast: (message: string, tone?: Toast["tone"]) => void }>({
  toast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, tone, message }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="card p-3 flex items-start gap-2.5 shadow-lg animate-[slideIn_.2s_ease]"
          >
            {t.tone === "success" ? (
              <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
            ) : (
              <XCircle size={18} className="text-danger shrink-0 mt-0.5" />
            )}
            <p className="text-sm flex-1">{t.message}</p>
            <button
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              className="text-muted hover:text-ink"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ───────────────────────── Modal ───────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`card w-full ${wide ? "max-w-2xl" : "max-w-md"} shadow-2xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 h-13 py-3.5 border-b border-edge shrink-0">
          <h2 className="font-semibold display text-[15px]">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── ConfirmDialog ───────────────────────── */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Page & list furniture ───────────────────────── */

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold display">{title}</h1>
        {sub && <p className="text-muted text-sm mt-0.5">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        className="input !pl-9 w-64 max-w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-14 px-4">
      <div className="mx-auto w-12 h-12 rounded-xl bg-surface-2 border border-edge flex items-center justify-center mb-3">
        <PackageOpen size={22} className="text-muted" />
      </div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-muted text-sm mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-3 space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-8 rounded bg-surface-2 animate-pulse" style={{ flex: c === 1 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "success" | "warn" | "danger" | "muted"; children: ReactNode }) {
  const styles = {
    success: "text-success border-success/40 bg-success/10",
    warn: "text-accent border-accent/40 bg-accent/10",
    danger: "text-danger border-danger/40 bg-danger/10",
    muted: "text-muted border-edge bg-surface-2",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${styles}`}>
      {children}
    </span>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 p-3 border-t border-edge text-sm">
      <button
        className="btn btn-secondary !p-1.5"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      <button
        className="btn btn-secondary !p-1.5"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
