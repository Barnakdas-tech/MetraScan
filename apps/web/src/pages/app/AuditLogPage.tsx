import { useEffect, useState } from "react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import { listAuditLogs, type AuditLogItem } from "../../lib/auditApi";
import { getErrorMessage } from "../../lib/api";

function actionTone(action: string): "default" | "success" | "warning" | "danger" | "info" {
  if (action.includes("ACCEPT") || action.includes("CREATED")) return "success";
  if (action.includes("REJECT") || action.includes("DEACTIVATED")) return "danger";
  if (action.includes("REVIEW") || action.includes("SUBMITTED")) return "warning";
  return "info";
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadLogs = async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLogs({ page: pageNum, pageSize: 25 });
      setLogs(res.items);
      setTotalPages(res.pagination.totalPages);
      setPage(pageNum);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs(1);
  }, []);

  if (loading && logs.length === 0) {
    return <LoadingState label="Loading audit logs..." />;
  }

  if (error && logs.length === 0) {
    return <ErrorState message={error} retry={() => loadLogs(1)} />;
  }

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Immutable system audit trail tracking inspection lifecycles, human decisions, evidence corrections, and administrative activities."
        actions={
          <Button variant="secondary" size="sm" onClick={() => loadLogs(page)} isLoading={loading}>
            Refresh
          </Button>
        }
      />

      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <Card title="Activity Log">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2.5 font-medium">Timestamp</th>
                  <th className="px-3 py-2.5 font-medium">Actor</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">Target Entity</th>
                  <th className="px-3 py-2.5 font-medium">Details &amp; Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-semibold text-slate-800">{log.actor?.name ?? "System"}</p>
                      <span className="text-[10px] text-slate-400">{log.actor?.role ?? "Automated"}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Badge tone={actionTone(log.action)}>{log.action.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">{log.entityType}</span>
                      {log.entityId && (
                        <span className="ml-1 text-[11px] text-slate-400 font-mono">
                          {log.entityId.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 max-w-md">
                      {log.metadata ? (
                        <pre className="rounded bg-slate-50 p-1.5 font-mono text-[11px] text-slate-700 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-3">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => loadLogs(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => loadLogs(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
