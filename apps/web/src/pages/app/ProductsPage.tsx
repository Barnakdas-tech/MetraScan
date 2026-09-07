import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import { listProducts } from "../../lib/inspectionApi";
import { getErrorMessage } from "../../lib/api";
import type { ProductsResponse } from "../../types/dashboard";

export default function ProductsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(p), pageSize: "10" };
      if (q) params.q = q;
      setData(await listProducts(params));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div>
      <PageHeader title="Products" description="Product repository — every product recorded through inspections." />
      <Card className="mb-4">
        <form
          onSubmit={e => {
            e.preventDefault();
            setPage(1);
            void load(1);
          }}
          className="flex gap-2"
        >
          <Input placeholder="Search by name, brand, manufacturer…" value={q} onChange={e => setQ(e.target.value)} className="flex-1" />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      <Card noPadding>
        {loading ? (
          <LoadingState label="Loading products..." />
        ) : error ? (
          <ErrorState message={error} retry={() => load(page)} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="⧉" title="No products found" description="Products appear here once inspections are created." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Inspections</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => navigate("/app/products/" + p.id)}
                    className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.brand ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.category ? <Badge tone="info">{p.category}</Badge> : <span className="text-xs text-slate-400">unknown</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p._count.inspections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-sm">
              <span className="text-xs text-slate-500">
                Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} total
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
                <Button variant="secondary" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
