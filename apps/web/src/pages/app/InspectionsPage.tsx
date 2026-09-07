import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import { getInspectionHistory } from "../../lib/inspectionApi";
import { getErrorMessage } from "../../lib/api";
import type { HistoryResponse } from "../../types/dashboard";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "CLOSED", label: "Closed" },
];

export default function InspectionsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);

  const load = async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(p), pageSize: "10", sortBy, sortOrder };
      if (q) params.q = q;
      if (status) params.status = status;
      if (productCategory) params.productCategory = productCategory;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setData(await getInspectionHistory(params));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void load(1);
  };

  return (
    <div>
      <PageHeader title="Inspection History" description="Search, filter, and browse all inspections." />

      <Card className="mb-4">
        <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Input
            placeholder="Search number, product, location…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="sm:col-span-2"
          />
          <Select value={status} onChange={e => setStatus(e.target.value)} options={STATUS_OPTIONS} />
          <Input placeholder="Category" value={productCategory} onChange={e => setProductCategory(e.target.value)} />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <div className="col-span-full flex flex-wrap items-center gap-2">
            <Select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              options={[
                { value: "createdAt", label: "Created" },
                { value: "inspectionDate", label: "Inspection date" },
                { value: "inspectionNumber", label: "Number" },
                { value: "status", label: "Status" },
              ]}
            />
            <Select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              options={[
                { value: "desc", label: "Descending" },
                { value: "asc", label: "Ascending" },
              ]}
            />
            <Button type="submit">Apply</Button>
          </div>
        </form>
      </Card>

      <Card noPadding>
        {loading ? (
          <LoadingState label="Loading inspections..." />
        ) : error ? (
          <ErrorState message={error} retry={() => load(page)} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon="≡"
            title="No inspections found"
            description={data && data.pagination.total === 0 ? "No inspections match your filters." : "Create your first inspection."}
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Inspection</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Violations</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(i => (
                  <tr
                    key={i.id}
                    onClick={() => navigate("/app/inspection/" + i.id)}
                    className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface"
                  >
                    <td className="px-4 py-3 font-medium text-brand">
                      {i.inspectionNumber}
                      {i.isDemo && <Badge tone="warning">DEMO</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{i.product ? i.product.name + (i.product.brand ? " (" + i.product.brand + ")" : "") : "—"}</td>
                    <td className="px-4 py-3"><Badge tone="info">{i.status}</Badge></td>
                    <td className="px-4 py-3">
                      {i.overallResult ? (
                        <Badge tone={i.overallResult === "PASS" ? "success" : i.overallResult === "FAIL" ? "danger" : "warning"}>
                          {i.overallResult}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{i._count.violations > 0 ? <Badge tone="danger">{i._count.violations}</Badge> : <span className="text-xs text-slate-400">0</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(i.createdAt).toLocaleDateString("en-IN")}</td>
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
