import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/api";

interface ProductDetail {
  product: {
    id: string;
    name: string;
    brand: string | null;
    genericName: string | null;
    manufacturer: string | null;
    category: string | null;
    categoryConfidence: number | null;
    categorySource: string | null;
    inspections: Array<{
      id: string;
      inspectionNumber: string;
      status: string;
      overallResult: string | null;
      inspectionDate: string;
      createdAt: string;
    }>;
    _count: { inspections: number };
  };
  complianceHistory: Array<{
    id: string;
    ruleId: string;
    status: string;
    humanStatus: string | null;
    confidence: number;
    reason: string;
    createdAt: string;
    inspection: { inspectionNumber: string; inspectionDate: string };
  }>;
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ success: boolean; data: ProductDetail }>("/products/" + productId);
        setData(res.data.data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [productId]);

  if (loading) return <LoadingState label="Loading product..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const p = data.product;

  return (
    <div>
      <PageHeader
        title={p.name}
        description={p.brand ? p.brand + " · " + (p.genericName ?? "") : p.genericName ?? "Product details"}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Product information">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Name</dt><dd className="font-medium">{p.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Brand</dt><dd>{p.brand ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Generic name</dt><dd>{p.genericName ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Manufacturer</dt><dd>{p.manufacturer ?? "—"}</dd></div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Category</dt>
              <dd className="flex items-center gap-1.5">
                {p.category ? <Badge tone="info">{p.category}</Badge> : <span className="text-slate-400">unknown</span>}
                {p.categoryConfidence !== null && (
                  <span className="text-xs text-slate-400">{Math.round(p.categoryConfidence * 100)}% (auto)</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Total inspections</dt><dd className="font-medium">{p._count.inspections}</dd></div>
          </dl>
        </Card>

        <Card title="Inspection history" noPadding>
          {p.inspections.length === 0 ? (
            <EmptyState title="No inspections" description="This product has no recorded inspections." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Inspection</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {p.inspections.map(i => (
                  <tr
                    key={i.id}
                    onClick={() => navigate("/app/inspection/" + i.id)}
                    className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface"
                  >
                    <td className="px-4 py-2.5 font-medium text-brand">{i.inspectionNumber}</td>
                    <td className="px-4 py-2.5">
                      {i.overallResult ? (
                        <Badge tone={i.overallResult === "PASS" ? "success" : i.overallResult === "FAIL" ? "danger" : "warning"}>
                          {i.overallResult}
                        </Badge>
                      ) : <span className="text-xs text-slate-400">pending</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(i.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Compliance history" noPadding className="lg:col-span-2">
          {data.complianceHistory.length === 0 ? (
            <EmptyState title="No compliance history" description="Run a compliance check on an inspection of this product." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Rule</th>
                  <th className="px-4 py-2 font-medium">AI status</th>
                  <th className="px-4 py-2 font-medium">Human</th>
                  <th className="px-4 py-2 font-medium">Confidence</th>
                  <th className="px-4 py-2 font-medium">Inspection</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.complianceHistory.map(c => (
                  <tr key={c.id} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{c.ruleId}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={c.status === "PASS" ? "success" : c.status === "FAIL" ? "danger" : c.status === "NOT_APPLICABLE" ? "default" : "warning"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.humanStatus ? <Badge tone="info">{c.humanStatus}</Badge> : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{Math.round(c.confidence * 100)}%</td>
                    <td className="px-4 py-2.5 font-medium text-brand">{c.inspection.inspectionNumber}</td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
