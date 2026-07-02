import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Package, Upload, Download, Search, X } from "lucide-react";
import { api, ApiError, download } from "../lib/api";
import { Product, Category, Unit, Brand, Paged, ProductType } from "../lib/types";
import { num, fmtMoney, fmtQty } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  EmptyState,
  TableSkeleton,
  SearchBox,
  Badge,
  Pagination,
  useToast,
} from "../components/ui";
import ImageDropzone from "../components/ImageDropzone";
import ImportWizard from "../components/ImportWizard";

type ComboLine = { componentProductId: string; name: string; sku: string; qty: string };

type FormState = {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  type: ProductType;
  categoryId: string;
  unitId: string;
  brandId: string;
  costPrice: string;
  salePrice: string;
  wholesalePrice: string;
  taxPercent: string;
  minStockLevel: string;
  openingStock: string;
  length: string;
  width: string;
  height: string;
  weight: string;
};
const emptyForm: FormState = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  type: "STANDARD",
  categoryId: "",
  unitId: "",
  brandId: "",
  costPrice: "0",
  salePrice: "0",
  wholesalePrice: "",
  taxPercent: "0",
  minStockLevel: "0",
  openingStock: "0",
  length: "",
  width: "",
  height: "",
  weight: "",
};

function stockCell(p: Product) {
  if (p.type === "SERVICE") return <Badge tone="muted">Service</Badge>;
  if (p.type === "COMBO") return <Badge tone="muted">Combo</Badge>;
  const stock = num(p.stockQty);
  const min = num(p.minStockLevel);
  const badge = stock <= 0 ? <Badge tone="danger">Out</Badge> : min > 0 && stock <= min ? <Badge tone="warn">Low</Badge> : <Badge tone="success">In</Badge>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="mono">{fmtQty(p.stockQty)} {p.unit?.shortName}</span>
      {badge}
    </span>
  );
}

export default function Products() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [comboItems, setComboItems] = useState<ComboLine[]>([]);
  const [comboSearch, setComboSearch] = useState("");
  const [newImages, setNewImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(search.trim() && { search: search.trim() }),
    ...(categoryId && { categoryId }),
    ...(brandId && { brandId }),
    ...(status && { status }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["products", page, search, categoryId, brandId, status],
    queryFn: () => api<Paged<"products", Product>>(`/products?${query}`),
    placeholderData: keepPreviousData,
  });
  const { data: catData } = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/categories") });
  const { data: unitData } = useQuery({ queryKey: ["units"], queryFn: () => api<{ units: Unit[] }>("/units") });
  const { data: brandData } = useQuery({ queryKey: ["brands-all"], queryFn: () => api<{ brands: Brand[] }>("/brands?status=active") });

  // Combo component search (only while building a combo)
  const { data: comboResults } = useQuery({
    queryKey: ["combo-search", comboSearch],
    queryFn: () => api<{ products: Product[] }>(`/products/search?q=${encodeURIComponent(comboSearch)}`),
    enabled: form.type === "COMBO" && comboSearch.trim().length > 0,
  });

  const products = data?.products ?? [];
  const categories = catData?.categories ?? [];
  const units = unitData?.units ?? [];
  const brands = brandData?.brands ?? [];

  const save = useMutation({
    mutationFn: async (payload: { id?: string; body: Record<string, unknown> }) => {
      const result = payload.id
        ? await api<{ product: Product }>(`/products/${payload.id}`, { method: "PATCH", body: payload.body })
        : await api<{ product: Product }>("/products", { method: "POST", body: payload.body });
      if (newImages.length > 0) {
        const fd = new FormData();
        for (const file of newImages) fd.append("images", file);
        await api(`/products/${result.product.id}/images`, { method: "POST", body: fd, isForm: true });
      }
      return result;
    },
    onSuccess: (d, payload) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast(payload.id ? `${d.product.name} updated` : `${d.product.name} added (${d.product.sku})`);
      setEditing(null);
    },
    onError: (e: ApiError) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/products/${id}`, { method: "DELETE" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast(d.message);
      setDeleting(null);
    },
    onError: (e: ApiError) => {
      toast(e.message, "error");
      setDeleting(null);
    },
  });

  const imageAction = useMutation({
    mutationFn: (action: { kind: "primary" | "delete"; productId: string; imageId: string }) =>
      action.kind === "primary"
        ? api(`/products/${action.productId}/images/${action.imageId}/primary`, { method: "PATCH" })
        : api(`/products/${action.productId}/images/${action.imageId}`, { method: "DELETE" }),
    onSuccess: async (_d, action) => {
      await qc.invalidateQueries({ queryKey: ["products"] });
      const fresh = await api<{ product: Product }>(`/products/${action.productId}`);
      setEditing(fresh.product);
    },
    onError: (e: ApiError) => toast(e.message, "error"),
  });

  function openNew() {
    setForm(emptyForm);
    setComboItems([]);
    setComboSearch("");
    setNewImages([]);
    setError(null);
    setEditing("new");
  }
  function openEdit(p: Product) {
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? "",
      description: p.description ?? "",
      type: p.type,
      categoryId: p.categoryId,
      unitId: p.unitId,
      brandId: p.brandId ?? "",
      costPrice: String(num(p.costPrice)),
      salePrice: String(num(p.salePrice)),
      wholesalePrice: p.wholesalePrice === null ? "" : String(num(p.wholesalePrice)),
      taxPercent: String(num(p.taxPercent)),
      minStockLevel: String(num(p.minStockLevel)),
      openingStock: "0",
      length: p.length === null ? "" : String(num(p.length)),
      width: p.width === null ? "" : String(num(p.width)),
      height: p.height === null ? "" : String(num(p.height)),
      weight: p.weight === null ? "" : String(num(p.weight)),
    });
    setComboItems(
      (p.comboItems ?? []).map((c) => ({
        componentProductId: c.componentProductId,
        name: c.componentProduct?.name ?? "",
        sku: c.componentProduct?.sku ?? "",
        qty: String(num(c.qty)),
      }))
    );
    setComboSearch("");
    setNewImages([]);
    setError(null);
    setEditing(p);
  }

  function addComboItem(p: Product) {
    if (comboItems.some((c) => c.componentProductId === p.id)) return;
    setComboItems([...comboItems, { componentProductId: p.id, name: p.name, sku: p.sku, qty: "1" }]);
    setComboSearch("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const isNew = editing === "new";
    const dimOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const body: Record<string, unknown> = {
      name: form.name,
      barcode: form.barcode || null,
      description: form.description || null,
      type: form.type,
      categoryId: form.categoryId,
      unitId: form.unitId,
      brandId: form.brandId || null,
      costPrice: Number(form.costPrice) || 0,
      salePrice: Number(form.salePrice) || 0,
      wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
      taxPercent: Number(form.taxPercent) || 0,
      minStockLevel: Number(form.minStockLevel) || 0,
      length: dimOrNull(form.length),
      width: dimOrNull(form.width),
      height: dimOrNull(form.height),
      weight: dimOrNull(form.weight),
    };
    if (form.type === "COMBO") {
      if (comboItems.length === 0) {
        setError("A combo needs at least one component product.");
        return;
      }
      body.comboItems = comboItems.map((c) => ({ componentProductId: c.componentProductId, qty: Number(c.qty) || 1 }));
    }
    if (isNew) {
      if (form.sku.trim()) body.sku = form.sku.trim();
      if (form.type === "STANDARD") body.openingStock = Number(form.openingStock) || 0;
    } else {
      body.sku = form.sku.trim();
    }
    save.mutate({ id: isNew ? undefined : (editing as Product).id, body });
  }

  const editingProduct = editing !== "new" ? (editing as Product | null) : null;

  return (
    <div>
      <PageHeader
        title="Products"
        sub="Everything you sell — prices, stock levels and photos."
        actions={
          <>
            {can("products.import") && (
              <>
                <button className="btn btn-secondary" onClick={() => download("/import/products/export?format=xlsx", "products-export.xlsx")}>
                  <Download size={16} /> Export
                </button>
                <button className="btn btn-secondary" onClick={() => setImporting(true)}>
                  <Upload size={16} /> Import
                </button>
              </>
            )}
            <button className="btn btn-secondary" onClick={openNew}>
              <Plus size={16} /> Add product
            </button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 mb-3">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, SKU, barcode…" />
        <select className="input !w-44" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>
          ))}
        </select>
        <select className="input !w-40" value={brandId} onChange={(e) => { setBrandId(e.target.value); setPage(1); }} aria-label="Filter by brand">
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select className="input !w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="active">Active</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
          <option value="inactive">Inactive</option>
          <option value="">All</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton cols={7} />
        ) : products.length === 0 ? (
          <EmptyState
            title={search || categoryId || brandId ? "No products match" : "No products yet"}
            hint={search || categoryId || brandId ? "Try different search or filters." : "Add your first product — e.g. Lucky Cement 50kg."}
            action={!search && !categoryId && !brandId && (
              <button className="btn btn-secondary" onClick={openNew}>
                <Plus size={16} /> Add product
              </button>
            )}
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-edge">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  <th className="px-4 py-2.5 font-medium text-right">Sale</th>
                  <th className="px-4 py-2.5 font-medium">Stock</th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const thumb = p.images.find((i) => i.isPrimary) ?? p.images[0];
                  return (
                    <tr key={p.id} className="border-b border-edge last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-2 font-medium">
                        <span className="inline-flex items-center gap-2.5">
                          {thumb ? (
                            <img src={thumb.thumbPath ?? thumb.path} alt="" className="w-8 h-8 rounded object-cover border border-edge" />
                          ) : (
                            <span className="w-8 h-8 rounded bg-surface-2 border border-edge flex items-center justify-center">
                              <Package size={14} className="text-muted" />
                            </span>
                          )}
                          <span>
                            {p.name}
                            {p.brand?.name && <span className="text-muted text-xs ml-2">{p.brand.name}</span>}
                            {!p.isActive && <span className="text-muted text-xs ml-2">(inactive)</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2 mono text-muted">{p.sku}</td>
                      <td className="px-4 py-2 text-muted">{p.category?.name}</td>
                      <td className="px-4 py-2 text-right money">{fmtMoney(p.costPrice)}</td>
                      <td className="px-4 py-2 text-right money">{fmtMoney(p.salePrice)}</td>
                      <td className="px-4 py-2">{stockCell(p)}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <button className="btn btn-secondary !p-1.5" onClick={() => openEdit(p)} title={`Edit ${p.name}`}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-secondary !p-1.5 hover:!text-danger" onClick={() => setDeleting(p)} title={`Delete ${p.name}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onPage={setPage} />
          </>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add product" : `Edit ${editingProduct?.name ?? ""}`} wide>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Product name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lucky Cement 50kg" required autoFocus />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ProductType })}>
                <option value="STANDARD">Standard (tracks stock)</option>
                <option value="SERVICE">Service (no stock — labour, delivery)</option>
                <option value="COMBO">Combo (bundle of products)</option>
              </select>
            </div>
            <div>
              <label className="label">Brand (optional)</label>
              <select className="input" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                <option value="">No brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                <option value="">Pick a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} required>
                <option value="">Pick a unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.shortName})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Cost price (what you pay)</label>
              <input className="input mono" type="number" step="0.01" min="0" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </div>
            <div>
              <label className="label">Sale price (what customer pays)</label>
              <input className="input mono" type="number" step="0.01" min="0" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
            </div>
            <div>
              <label className="label">Wholesale price (optional)</label>
              <input className="input mono" type="number" step="0.01" min="0" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} />
            </div>
            <div>
              <label className="label">Tax %</label>
              <input className="input mono" type="number" step="0.01" min="0" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} />
            </div>
            {form.type === "STANDARD" && (
              <>
                <div>
                  <label className="label">Low-stock alert level</label>
                  <input className="input mono" type="number" step="any" min="0" value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} />
                </div>
                {editing === "new" && (
                  <div>
                    <label className="label">Opening stock (current count)</label>
                    <input className="input mono" type="number" step="any" min="0" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: e.target.value })} />
                  </div>
                )}
              </>
            )}
            <div>
              <label className="label">SKU {editing === "new" && "(leave empty = auto)"}</label>
              <input className="input mono" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="CEM-0001" />
            </div>
            <div>
              <label className="label">Barcode (optional)</label>
              <input className="input mono" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
          </div>

          {/* Combo builder */}
          {form.type === "COMBO" && (
            <div className="rounded-lg border border-edge p-3 space-y-2">
              <label className="label !mb-0">Combo components — selling this deducts their stock</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input !pl-9" value={comboSearch} onChange={(e) => setComboSearch(e.target.value)} placeholder="Search a product to add…" />
                {comboSearch.trim() && (comboResults?.products.length ?? 0) > 0 && (
                  <div className="absolute z-10 mt-1 w-full card max-h-48 overflow-y-auto">
                    {comboResults!.products
                      .filter((r) => r.type !== "COMBO" && r.id !== editingProduct?.id)
                      .map((r) => (
                        <button type="button" key={r.id} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 flex justify-between" onClick={() => addComboItem(r)}>
                          <span>{r.name}</span>
                          <span className="mono text-muted">{r.sku}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {comboItems.length === 0 ? (
                <p className="text-xs text-muted">No components yet — search above to add products.</p>
              ) : (
                <div className="space-y-1.5">
                  {comboItems.map((c, i) => (
                    <div key={c.componentProductId} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{c.name} <span className="mono text-muted text-xs">{c.sku}</span></span>
                      <input
                        className="input mono !w-24 !py-1"
                        type="number"
                        step="any"
                        min="0"
                        value={c.qty}
                        onChange={(e) => setComboItems(comboItems.map((x, idx) => (idx === i ? { ...x, qty: e.target.value } : x)))}
                        aria-label={`Quantity of ${c.name}`}
                      />
                      <button type="button" className="text-muted hover:text-danger" onClick={() => setComboItems(comboItems.filter((_, idx) => idx !== i))} aria-label="Remove component">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dimensions (G10) */}
          <details className="rounded-lg border border-edge px-3 py-2">
            <summary className="text-sm text-muted cursor-pointer">Dimensions & weight (optional)</summary>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div><label className="label">Length</label><input className="input mono" type="number" step="any" min="0" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} /></div>
              <div><label className="label">Width</label><input className="input mono" type="number" step="any" min="0" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} /></div>
              <div><label className="label">Height</label><input className="input mono" type="number" step="any" min="0" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></div>
              <div><label className="label">Weight</label><input className="input mono" type="number" step="any" min="0" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></div>
            </div>
          </details>

          <div className="sm:col-span-2">
            <label className="label">Description (optional)</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Photos */}
          <div>
            <label className="label">Photos</label>
            <ImageDropzone
              saved={(editingProduct?.images ?? []).map((img) => ({ id: img.id, url: img.thumbPath ?? img.path, isPrimary: img.isPrimary }))}
              onSetPrimary={editingProduct ? (id) => imageAction.mutate({ kind: "primary", productId: editingProduct.id, imageId: id }) : undefined}
              onDeleteSaved={editingProduct ? (id) => imageAction.mutate({ kind: "delete", productId: editingProduct.id, imageId: id }) : undefined}
              files={newImages}
              onFilesChange={setNewImages}
              max={5}
            />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-secondary !border-accent !text-accent" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save product"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ""}?`}
        message={`"${deleting?.name}" will be removed. If it already has sales or stock history it is deactivated instead, so old invoices stay correct.`}
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />

      <ImportWizard entity="products" open={importing} onClose={() => setImporting(false)} onDone={() => qc.invalidateQueries({ queryKey: ["products"] })} />
    </div>
  );
}
