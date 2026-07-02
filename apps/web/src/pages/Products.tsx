import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Package, ImagePlus, Star, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Product, Category, Unit, Paged } from "../lib/types";
import { num, fmtMoney, fmtQty } from "../lib/format";
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

type FormState = {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  unitId: string;
  costPrice: string;
  salePrice: string;
  wholesalePrice: string;
  taxPercent: string;
  minStockLevel: string;
  openingStock: string;
};
const emptyForm: FormState = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  categoryId: "",
  unitId: "",
  costPrice: "0",
  salePrice: "0",
  wholesalePrice: "",
  taxPercent: "0",
  minStockLevel: "0",
  openingStock: "0",
};

function stockBadge(p: Product) {
  const stock = num(p.stockQty);
  const min = num(p.minStockLevel);
  if (stock <= 0) return <Badge tone="danger">Out</Badge>;
  if (min > 0 && stock <= min) return <Badge tone="warn">Low</Badge>;
  return <Badge tone="success">In stock</Badge>;
}

export default function Products() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(search.trim() && { search: search.trim() }),
    ...(categoryId && { categoryId }),
    ...(status && { status }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["products", page, search, categoryId, status],
    queryFn: () => api<Paged<"products", Product>>(`/products?${query}`),
    placeholderData: keepPreviousData,
  });
  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<{ categories: Category[] }>("/categories"),
  });
  const { data: unitData } = useQuery({
    queryKey: ["units"],
    queryFn: () => api<{ units: Unit[] }>("/units"),
  });

  const products = data?.products ?? [];
  const categories = catData?.categories ?? [];
  const units = unitData?.units ?? [];

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
      // refresh the open editor with latest images
      const fresh = await api<{ product: Product }>(`/products/${action.productId}`);
      setEditing(fresh.product);
    },
    onError: (e: ApiError) => toast(e.message, "error"),
  });

  function openNew() {
    setForm(emptyForm);
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
      categoryId: p.categoryId,
      unitId: p.unitId,
      costPrice: String(num(p.costPrice)),
      salePrice: String(num(p.salePrice)),
      wholesalePrice: p.wholesalePrice === null ? "" : String(num(p.wholesalePrice)),
      taxPercent: String(num(p.taxPercent)),
      minStockLevel: String(num(p.minStockLevel)),
      openingStock: "0",
    });
    setNewImages([]);
    setError(null);
    setEditing(p);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const isNew = editing === "new";
    const body: Record<string, unknown> = {
      name: form.name,
      barcode: form.barcode || null,
      description: form.description || null,
      categoryId: form.categoryId,
      unitId: form.unitId,
      costPrice: Number(form.costPrice) || 0,
      salePrice: Number(form.salePrice) || 0,
      wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
      taxPercent: Number(form.taxPercent) || 0,
      minStockLevel: Number(form.minStockLevel) || 0,
    };
    if (isNew) {
      if (form.sku.trim()) body.sku = form.sku.trim();
      body.openingStock = Number(form.openingStock) || 0;
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
          <button className="btn btn-secondary" onClick={openNew}>
            <Plus size={16} /> Add product
          </button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-3">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name, SKU, barcode…"
        />
        <select
          className="input !w-48"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `— ${c.name}` : c.name}
            </option>
          ))}
        </select>
        <select
          className="input !w-36"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
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
            title={search || categoryId ? "No products match" : "No products yet"}
            hint={
              search || categoryId
                ? "Try different search or filters."
                : "Add your first product — e.g. Lucky Cement 50kg."
            }
            action={
              !search &&
              !categoryId && (
                <button className="btn btn-secondary" onClick={openNew}>
                  <Plus size={16} /> Add product
                </button>
              )
            }
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
                  <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
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
                            <img
                              src={thumb.thumbPath ?? thumb.path}
                              alt=""
                              className="w-8 h-8 rounded object-cover border border-edge"
                            />
                          ) : (
                            <span className="w-8 h-8 rounded bg-surface-2 border border-edge flex items-center justify-center">
                              <Package size={14} className="text-muted" />
                            </span>
                          )}
                          <span>
                            {p.name}
                            {!p.isActive && <span className="text-muted text-xs ml-2">(inactive)</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2 mono text-muted">{p.sku}</td>
                      <td className="px-4 py-2 text-muted">{p.category?.name}</td>
                      <td className="px-4 py-2 text-right money">{fmtMoney(p.costPrice)}</td>
                      <td className="px-4 py-2 text-right money">{fmtMoney(p.salePrice)}</td>
                      <td className="px-4 py-2 text-right mono">
                        {fmtQty(p.stockQty)} {p.unit?.shortName}
                      </td>
                      <td className="px-4 py-2">{stockBadge(p)}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn btn-secondary !p-1.5"
                            onClick={() => openEdit(p)}
                            title={`Edit ${p.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-secondary !p-1.5 hover:!text-danger"
                            onClick={() => setDeleting(p)}
                            title={`Delete ${p.name}`}
                          >
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

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add product" : `Edit ${editingProduct?.name ?? ""}`}
        wide
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Product name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Lucky Cement 50kg"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required
              >
                <option value="">Pick a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? `— ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <select
                className="input"
                value={form.unitId}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                required
              >
                <option value="">Pick a unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.shortName})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Cost price (what you pay)</label>
              <input
                className="input mono"
                type="number"
                step="0.01"
                min="0"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Sale price (what customer pays)</label>
              <input
                className="input mono"
                type="number"
                step="0.01"
                min="0"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Wholesale price (optional)</label>
              <input
                className="input mono"
                type="number"
                step="0.01"
                min="0"
                value={form.wholesalePrice}
                onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Low-stock alert level</label>
              <input
                className="input mono"
                type="number"
                step="any"
                min="0"
                value={form.minStockLevel}
                onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
              />
            </div>
            {editing === "new" && (
              <div>
                <label className="label">Opening stock (current count)</label>
                <input
                  className="input mono"
                  type="number"
                  step="any"
                  min="0"
                  value={form.openingStock}
                  onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="label">SKU {editing === "new" && "(leave empty = auto)"}</label>
              <input
                className="input mono"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="CEM-0001"
              />
            </div>
            <div>
              <label className="label">Barcode (optional)</label>
              <input
                className="input mono"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description (optional)</label>
              <textarea
                className="input"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          {/* Images */}
          <div>
            <label className="label">Photos</label>
            <div className="flex flex-wrap gap-2">
              {editingProduct?.images.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.thumbPath ?? img.path}
                    alt=""
                    className={`w-16 h-16 rounded-lg object-cover border ${
                      img.isPrimary ? "border-accent" : "border-edge"
                    }`}
                  />
                  <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    {!img.isPrimary && (
                      <button
                        type="button"
                        title="Make primary"
                        className="text-white hover:text-accent"
                        onClick={() =>
                          imageAction.mutate({ kind: "primary", productId: editingProduct.id, imageId: img.id })
                        }
                      >
                        <Star size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Remove image"
                      className="text-white hover:text-danger"
                      onClick={() =>
                        imageAction.mutate({ kind: "delete", productId: editingProduct.id, imageId: img.id })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {img.isPrimary && (
                    <Star size={12} className="absolute -top-1 -right-1 text-accent fill-current" />
                  )}
                </div>
              ))}
              {newImages.map((file, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border border-dashed border-accent/60"
                  />
                  <button
                    type="button"
                    className="absolute -top-1.5 -right-1.5 bg-surface border border-edge rounded-full p-0.5 text-muted hover:text-danger"
                    onClick={() => setNewImages((list) => list.filter((_, idx) => idx !== i))}
                    aria-label="Remove pending image"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <label className="w-16 h-16 rounded-lg border border-dashed border-edge hover:border-accent cursor-pointer flex flex-col items-center justify-center text-muted hover:text-accent transition-colors">
                <ImagePlus size={18} />
                <span className="text-[10px] mt-0.5">Add</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setNewImages((list) => [...list, ...files].slice(0, 5));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted mt-1.5">Up to 5 photos — first upload becomes the main photo.</p>
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
    </div>
  );
}
