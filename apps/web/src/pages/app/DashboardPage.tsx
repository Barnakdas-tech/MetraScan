import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import { getDashboardSummary, getDashboardRecent } from "../../lib/inspectionApi";
import { getErrorMessage } from "../../lib/api";
import type { DashboardSummary, RecentInspection } from "../../types/dashboard";

function Icon({ name, className }: { name: string; className?: string }) {
  const base = className ?? "w-5 h-5";
  switch (name) {
    case "total":
      return (
        <svg className={base} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "check":
      return (
        <svg className={base} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case "x":
      return (
        <svg className={base} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case "review":
      return (
        <svg className={base} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "warning":
      return (
        <svg className={base} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

function StatCard({ label, value, description, tone, icon }: { label: string; value: string | number; description: string; tone: "emerald" | "red" | "amber" | "brand" | "slate"; icon: string }) {
  const colors = {
    emerald: "border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:border-emerald-300",
    red: "border-red-200 text-red-700 bg-red-50/50 hover:border-red-300",
    amber: "border-amber-200 text-amber-700 bg-amber-50/50 hover:border-amber-300",
    brand: "border-brand/30 text-brand bg-brand-light/20 hover:border-brand/50",
    slate: "border-slate-200 text-slate-700 bg-slate-50 hover:border-slate-300",
  };

  const textColors = {
    emerald: "text-emerald-900",
    red: "text-red-900",
    amber: "text-amber-900",
    brand: "text-brand-dark",
    slate: "text-slate-900",
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border border-t-4 p-5 shadow-sm transition-all duration-200 ${colors[tone]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">{label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className={`text-3xl font-extrabold tracking-tight ${textColors[tone]}`}>{value}</h3>
          </div>
          <p className="mt-1.5 text-xs font-medium opacity-75">{description}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60 shadow-sm ring-1 ring-black/5">
          <Icon name={icon} className="w-5 h-5 opacity-90" />
        </div>
      </div>
    </div>
  );
}

function ComplianceBar({ summary }: { summary: DashboardSummary }) {
  const total = summary.totalInspections;
  if (total === 0) return null;

  const compPct = (summary.compliant / total) * 100;
  const revPct = (summary.reviewRequired / total) * 100;
  const failPct = (summary.nonCompliant / total) * 100;

  return (
    <Card title="Compliance Distribution" className="lg:col-span-2 flex flex-col justify-center border-slate-200/60 shadow-sm hover:shadow-md transition-shadow">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{total.toLocaleString()} Total Records</span>
      </div>
      
      <div className="h-8 w-full bg-slate-100 rounded-lg overflow-hidden flex shadow-inner border border-slate-200/50">
        {compPct > 0 && <div className="bg-emerald-500 h-full border-r border-white/20 transition-all duration-700 flex items-center justify-center" style={{ width: `${compPct}%` }} title={`Compliant: ${summary.compliant}`}>
          {compPct > 15 && <span className="text-[10px] font-bold text-white px-2 truncate">{compPct.toFixed(1)}%</span>}
        </div>}
        {revPct > 0 && <div className="bg-amber-400 h-full border-r border-white/20 transition-all duration-700 flex items-center justify-center" style={{ width: `${revPct}%` }} title={`Review Required: ${summary.reviewRequired}`}>
          {revPct > 15 && <span className="text-[10px] font-bold text-white px-2 truncate">{revPct.toFixed(1)}%</span>}
        </div>}
        {failPct > 0 && <div className="bg-red-500 h-full transition-all duration-700 flex items-center justify-center" style={{ width: `${failPct}%` }} title={`Non-compliant: ${summary.nonCompliant}`}>
          {failPct > 15 && <span className="text-[10px] font-bold text-white px-2 truncate">{failPct.toFixed(1)}%</span>}
        </div>}
      </div>
      
      <div className="flex flex-wrap gap-4 mt-4 text-xs font-semibold">
        <span className="text-emerald-700 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> {summary.compliant.toLocaleString()} Pass</span>
        <span className="text-amber-700 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div> {summary.reviewRequired.toLocaleString()} Review</span>
        <span className="text-red-700 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> {summary.nonCompliant.toLocaleString()} Fail</span>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<RecentInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([getDashboardSummary(), getDashboardRecent()]);
      setSummary(s);
      setRecent(r);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading dashboard..." />;
  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="pb-16">
      <PageHeader
        title="Dashboard"
        description="Operational overview — real data from the inspection database."
        actions={
          <Button onClick={() => navigate("/app/inspection/new")}>
            New Inspection
          </Button>
        }
      />

      <div className="space-y-6">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard 
            label="Total Inspections" 
            value={summary?.totalInspections.toLocaleString() ?? "0"} 
            description="Lifetime records" 
            tone="brand" 
            icon="total" 
          />
          <StatCard 
            label="Compliant" 
            value={summary?.compliant.toLocaleString() ?? "0"} 
            description="Clean inspections" 
            tone="emerald" 
            icon="check" 
          />
          <StatCard 
            label="Non-Compliant" 
            value={summary?.nonCompliant.toLocaleString() ?? "0"} 
            description="Failed assessments" 
            tone="red" 
            icon="x" 
          />
          <StatCard 
            label="Review Required" 
            value={summary?.reviewRequired.toLocaleString() ?? "0"} 
            description="Pending manual triage" 
            tone="amber" 
            icon="review" 
          />
          <StatCard 
            label="Open Violations" 
            value={summary?.openViolations.toLocaleString() ?? "0"} 
            description="Unresolved findings" 
            tone="red" 
            icon="warning" 
          />
        </div>

        {/* Visual Summary Row (if data exists) */}
        {summary && summary.totalInspections > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <ComplianceBar summary={summary} />
            <div className="col-span-1 lg:col-span-3">
              {/* Intentional negative space or reserved for future metrics */}
            </div>
          </div>
        )}

        <Card title="Recent Operational Activity" noPadding className="border-slate-200/60 shadow-sm">
          {recent.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon="📋"
                title="No inspections found"
                description="Begin by launching a new inspection to track compliance."
                action={<Button onClick={() => navigate("/app/inspection/new")}>Create inspection</Button>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 font-semibold">Inspection ID</th>
                    <th className="px-6 py-4 font-semibold">Product</th>
                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                    <th className="px-6 py-4 font-semibold">Inspector</th>
                    <th className="px-6 py-4 font-semibold text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map(r => (
                    <tr
                      key={r.id}
                      onClick={() => navigate("/app/inspection/" + r.id)}
                      className="group cursor-pointer hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-brand group-hover:text-brand-dark transition-colors">
                        <span className="border-b border-transparent group-hover:border-brand-dark/30 pb-0.5 mr-2">
                          {r.inspectionNumber}
                        </span>
                        {r.isDemo && <span><Badge tone="warning">DEMO</Badge></span>}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {r.product ?? <span className="text-slate-400 font-normal">Unspecified Product</span>}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        {r.overallResult ? (
                          <Badge tone={r.overallResult === "PASS" ? "success" : r.overallResult === "FAIL" ? "danger" : "warning"}>
                            {r.overallResult}
                          </Badge>
                        ) : (
                          <Badge tone="default">PENDING</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {r.inspector ?? <span className="text-slate-400">System</span>}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-slate-500 font-medium">
                        {new Date(r.createdAt).toLocaleDateString("en-IN", {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
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
