import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import { getDashboardViolations } from "../../lib/inspectionApi";
import { getErrorMessage } from "../../lib/api";
import type { DashboardViolation } from "../../types/dashboard";

export default function ViolationsPage() {
  const navigate = useNavigate();
  const [violations, setViolations] = useState<DashboardViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setViolations(await getDashboardViolations());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <PageHeader title="Violations" description="All violations detected by the automated screening, with review status." />
      <Card noPadding>
        {loading ? (
          <LoadingState label="Loading violations..." />
        ) : error ? (
          <ErrorState message={error} retry={load} />
        ) : violations.length === 0 ? (
          <EmptyState icon="✓" title="No violations recorded" description="When the compliance engine detects a violation, it appears here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Rule</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Inspection</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {violations.map(v => (
                <tr
                  key={v.id}
                  onClick={() => navigate("/app/inspection/" + v.inspectionId)}
                  className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{v.ruleId}</span>
                    {v.productCategory && <Badge tone="info">{v.productCategory}</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={v.status === "OPEN" ? "danger" : "success"}>{v.status}</Badge>
                    <Badge tone={v.category === "FAIL" ? "danger" : v.category === "PASS" ? "success" : "warning"}>{v.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{v.product ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-brand">{v.inspectionNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(v.date).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
