import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import { getReviewQueue, type ReviewQueueItem } from "../../lib/inspectionApi";
import { getErrorMessage } from "../../lib/api";

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getReviewQueue();
      setQueue(items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  if (loading && queue.length === 0) {
    return <LoadingState label="Loading review queue..." />;
  }

  if (error && queue.length === 0) {
    return <ErrorState message={error} retry={loadQueue} />;
  }

  return (
    <div>
      <PageHeader
        title="Review Queue"
        description="Cases requiring human verification, conflict resolution, or physical inspection decision."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={queue.length > 0 ? "warning" : "success"}>
              {queue.length} case{queue.length === 1 ? "" : "s"} pending
            </Badge>
            <Button variant="secondary" size="sm" onClick={loadQueue} isLoading={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <Card title="Pending Review Cases">
          {queue.length === 0 ? (
            <EmptyState
              icon="✓"
              title="No pending reviews"
              description="All inspections have been resolved or are compliant. New cases flagged for review by the AI engine or submitted by inspectors will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2.5 font-medium">Inspection</th>
                    <th className="px-3 py-2.5 font-medium">Product</th>
                    <th className="px-3 py-2.5 font-medium">Inspector</th>
                    <th className="px-3 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">AI Status</th>
                    <th className="px-3 py-2.5 font-medium">Pending Rules / Reasons</th>
                    <th className="px-3 py-2.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {queue.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-3 py-3">
                        <Link
                          to={`/app/inspection/${item.id}`}
                          className="font-semibold text-brand hover:underline"
                        >
                          {item.inspectionNumber}
                        </Link>
                        <div className="mt-0.5">
                          <Badge tone="default">{item.packageType}</Badge>
                          {item.status === "UNDER_REVIEW" && (
                            <span className="ml-1.5 inline-block">
                              <Badge tone="warning">UNDER REVIEW</Badge>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800">
                          {item.product?.name ?? "Unidentified Product"}
                        </p>
                        {item.product?.category && (
                          <p className="text-xs text-slate-400">{item.product.category}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <p className="font-medium">{item.inspector?.name ?? "Unknown"}</p>
                        <p className="text-slate-400">{item.inspector?.email ?? "—"}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(item.inspectionDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Badge
                          tone={
                            item.overallResult === "FAIL"
                              ? "danger"
                              : item.overallResult === "PASS"
                              ? "success"
                              : "warning"
                          }
                        >
                          {item.overallResult ?? "REVIEW"}
                        </Badge>
                        {item.hasConflicts && (
                          <div className="mt-1">
                            <Badge tone="warning">Conflict across images</Badge>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-xs">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {item.pendingRules.map(r => (
                            <span
                              key={r}
                              className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900"
                            >
                              Rule {r}
                            </span>
                          ))}
                        </div>
                        {item.reasons.length > 0 && (
                          <p className="line-clamp-2 text-xs text-slate-500" title={item.reasons.join("; ")}>
                            {item.reasons[0]}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <Link to={`/app/inspection/${item.id}`}>
                          <Button size="sm">Review Case</Button>
                        </Link>
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
