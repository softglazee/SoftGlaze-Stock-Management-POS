import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, FolderTree, CornerDownRight, ImagePlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Category } from "../lib/types";
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  EmptyState,
  TableSkeleton,
  SearchBox,
  Badge,
  useToast,
} from "../components/ui";

type FormState = { name: string; parentId: string };
const emptyForm: FormState = { name: "", parentId: "" };

export default function Categories() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<{ categories: Category[] }>("/categories"),
  });
  const categories = data?.categories ?? [];

  /** Parents first, each followed by its children (indented) */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (c: Category) => !q || c.name.toLowerCase().includes(q);
    const parents = categories.filter((c) => !c.parentId);
    const out: { cat: Category; depth: number }[] = [];
    for (const p of parents) {
      const children = categories.filter((c) => c.parentId === p.id);
      const visible = match(p) || children.some(match);
      if (!visible) continue;
      out.push({ cat: p, depth: 0 });
      for (const child of children) {
        if (!q || match(child) || match(p)) out.push({ cat: child, depth: 1 });
      }
    }
    // Orphans whose parent chain is deeper than 1 still show flat
    for (const c of categories) {
      if (c.parentId && !parents.some((p) => p.id === c.parentId) && match(c)) {
        out.push({ cat: c, depth: 1 });
      }
    }
    return out;
  }, [categories, search]);

  const save = useMutation({
    mutationFn: async (payload: { id?: string; body: Record<string, unknown> }) => {
      const result = payload.id
        ? await api<{ category: Category }>(`/categories/${payload.id}`, { method: "PATCH", body: payload.body })
        : await api<{ category: Category }>("/categories", { method: "POST", body: payload.body });
      if (imageFile) {
        const fd = new FormData();
        fd.append("image", imageFile);
        await api(`/categories/${result.category.id}/image`, { method: "POST", body: fd, isForm: true });
      }
      return result;
    },
    onSuccess: (_d, payload) => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast(payload.id ? `Category ${form.name} updated` : `Category ${form.name} added`);
      setEditing(null);
    },
    onError: (e: ApiError) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast(d.message);
      setDeleting(null);
    },
    onError: (e: ApiError) => {
      toast(e.message, "error");
      setDeleting(null);
    },
  });

  function openNew() {
    setForm(emptyForm);
    setImageFile(null);
    setError(null);
    setEditing("new");
  }
  function openEdit(cat: Category) {
    setForm({ name: cat.name, parentId: cat.parentId ?? "" });
    setImageFile(null);
    setError(null);
    setEditing(cat);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate({
      id: editing === "new" ? undefined : (editing as Category)?.id,
      body: { name: form.name, parentId: form.parentId || null },
    });
  }

  const parentOptions = categories.filter(
    (c) => !c.parentId && (editing === "new" || c.id !== (editing as Category)?.id)
  );

  return (
    <div>
      <PageHeader
        title="Categories"
        sub="Group your stock — Cement, Sariya sizes, Doors — so POS and reports stay organised."
        actions={
          <button className="btn btn-secondary" onClick={openNew}>
            <Plus size={16} /> Add category
          </button>
        }
      />

      <div className="mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search categories…" />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={search ? "Nothing matches your search" : "No categories yet"}
            hint={search ? "Try a different name." : "Add your first category, e.g. Cement."}
            action={
              !search && (
                <button className="btn btn-secondary" onClick={openNew}>
                  <Plus size={16} /> Add category
                </button>
              )
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-edge">
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium text-right">Products</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cat, depth }) => (
                <tr key={cat.id} className="border-b border-edge last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-2" style={{ paddingLeft: depth * 22 }}>
                      {depth > 0 ? (
                        <CornerDownRight size={14} className="text-muted" />
                      ) : cat.image ? (
                        <img
                          src={cat.image}
                          alt=""
                          className="w-6 h-6 rounded object-cover border border-edge"
                        />
                      ) : (
                        <FolderTree size={14} className="text-muted" />
                      )}
                      {cat.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right mono">{cat._count?.products ?? 0}</td>
                  <td className="px-4 py-2">
                    {cat.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn btn-secondary !p-1.5"
                        onClick={() => openEdit(cat)}
                        title={`Edit ${cat.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn btn-secondary !p-1.5 hover:!text-danger"
                        onClick={() => setDeleting(cat)}
                        title={`Delete ${cat.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add category" : `Edit ${(editing as Category)?.name ?? ""}`}
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Cement"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Parent category (optional)</label>
            <select
              className="input"
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">— top level —</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Image (optional)</label>
            <label className="btn btn-secondary cursor-pointer">
              <ImagePlus size={15} />
              {imageFile ? imageFile.name : "Choose image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-secondary !border-accent !text-accent" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save category"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ""}?`}
        message={`This removes the category "${deleting?.name}". Categories with products or sub-categories cannot be deleted.`}
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
