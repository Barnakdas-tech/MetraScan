import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";
import { getReports, HistoricalReport } from "../../lib/reportApi";
import { getErrorMessage, downloadAuthenticatedFile, viewAuthenticatedFile } from "../../lib/api";

export default function ReportsPage() {
  const [reports, setReports] = useState<HistoricalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setReports(await getReports());
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleDownload = async (reportId: string, inspectionNumber: string) => {
    try {
      setActionInProgress(`download-${reportId}`);
      await downloadAuthenticatedFile(`/reports/${reportId}/download`, `${inspectionNumber}-compliance-report.pdf`);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleView = async (reportId: string) => {
    try {
      setActionInProgress(`view-${reportId}`);
      await viewAuthenticatedFile(`/reports/${reportId}/download?inline=true`);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) return <LoadingState label="Loading historical reports..." />;
  if (error) return <ErrorState message={error} retry={() => window.location.reload()} />;

  return (
    <div>
      <PageHeader
        title="Compliance Reports"
        description="Historical archive of all generated compliance inspection reports."
      />
      <div className="mx-auto mt-6 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <Card title="Report Archive" className="overflow-hidden">
          {reports.length === 0 ? (
            <EmptyState icon="📄" title="No reports found" description="You have not generated any compliance reports yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Inspection</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Verdict</th>
                    <th className="px-4 py-3 font-medium text-center">Summary</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr
                      key={report.reportId}
                      className="border-b border-surface-border last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-brand">
                        <Link to={`/app/inspections/${report.inspectionId}`} className="hover:underline">
                          {report.inspectionNumber}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {new Date(report.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {report.productName || "Unknown"}
                        {report.productCategory && <span className="block text-xs text-slate-500">{report.productCategory}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {report.overallResult === "PASS" && <Badge tone="success">PASS</Badge>}
                        {report.overallResult === "FAIL" && <Badge tone="danger">FAIL</Badge>}
                        {report.overallResult === "REVIEW" && <Badge tone="warning">REVIEW</Badge>}
                        {!["PASS", "FAIL", "REVIEW"].includes(report.overallResult || "") && (
                          <Badge tone="default">{report.overallResult || "N/A"}</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-xs">
                        <div className="flex justify-center gap-2">
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">{report.summary.passed}</span>
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded font-medium">{report.summary.failed}</span>
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">{report.summary.review}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => handleView(report.reportId)}
                            disabled={actionInProgress === `view-${report.reportId}`}
                            className="text-sm font-medium text-brand hover:underline disabled:opacity-50"
                          >
                            {actionInProgress === `view-${report.reportId}` ? "Opening..." : "View PDF"}
                          </button>
                          <button
                            onClick={() => handleDownload(report.reportId, report.inspectionNumber)}
                            disabled={actionInProgress === `download-${report.reportId}`}
                            className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50"
                          >
                            {actionInProgress === `download-${report.reportId}` ? "Downloading..." : "Download"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
