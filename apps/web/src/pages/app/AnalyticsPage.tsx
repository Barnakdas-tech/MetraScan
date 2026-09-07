import { useEffect, useState } from "react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import { getTrends, getDashboardSummary } from "../../lib/inspectionApi";
import { getErrorMessage } from "../../lib/api";
import type { Trends, DashboardSummary } from "../../types/dashboard";

function VisualBar({ label, value, max, tone, totalCount }: { label: string; value: number; max: number; tone: string; totalCount?: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const pctOfTotal = totalCount && totalCount > 0 ? (value / totalCount) * 100 : 0;
  
  return (
    <div className="group flex items-center gap-4 py-3 hover:bg-slate-50/50 transition-colors rounded-lg px-2 -mx-2">
      <div className="w-5/12 shrink-0 flex flex-col justify-center pr-2">
        <span className="text-sm font-medium text-slate-700 truncate" title={label}>{label}</span>
      </div>
      <div className="flex-1 flex items-center gap-4">
        <div className="h-2 flex-1 rounded-full bg-slate-100/80 overflow-hidden shadow-inner">
          <div className={`h-full rounded-full ${tone} transition-all duration-700 ease-out`} style={{ width: `${Math.max(1.5, pct)}%` }} />
        </div>
        <div className="w-16 shrink-0 text-right flex flex-col justify-center">
          <span className="text-sm font-semibold text-slate-700">{value.toLocaleString()}</span>
          {totalCount && <span className="text-[10px] font-medium text-slate-400">{pctOfTotal.toFixed(1)}%</span>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, description, tone, icon }: { label: string; value: string | number; description: string; tone: "emerald" | "red" | "amber" | "brand" | "slate"; icon: string }) {
  const colors = {
    emerald: "text-emerald-600 bg-emerald-50/50 ring-emerald-100",
    red: "text-red-600 bg-red-50/50 ring-red-100",
    amber: "text-amber-600 bg-amber-50/50 ring-amber-100",
    brand: "text-brand bg-brand-light/20 ring-brand/20",
    slate: "text-slate-600 bg-slate-50/80 ring-slate-200",
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-2">{label}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold tracking-tight text-slate-900">{value}</h3>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500">{description}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ring-1 ${colors[tone]}`}>
          <span className="text-xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

function CircularProgress({ percentage, label, description }: { percentage: number; label: string; description: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-2">
      <div className="relative shrink-0 flex items-center justify-center">
        <svg className="w-32 h-32 transform -rotate-90 drop-shadow-sm">
          <circle cx="64" cy="64" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
          <circle 
            cx="64" cy="64" r={radius} 
            stroke="currentColor" strokeWidth="8" fill="transparent" 
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} 
            strokeLinecap="round"
            className="text-amber-500 transition-all duration-1000 ease-out" 
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-slate-800">{percentage}%</span>
        </div>
      </div>
      <div className="text-center sm:text-left pt-2">
        <h4 className="text-lg font-bold text-slate-800">{label}</h4>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-xs">{description}</p>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [trends, setTrends] = useState<Trends | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s] = await Promise.all([getTrends(), getDashboardSummary()]);
      setTrends(t);
      setSummary(s);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading analytics..." />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (!trends || !summary) return null;

  const hasData = summary.totalInspections > 0;

  const maxRule = Math.max(1, ...trends.violationsByRule.map(v => v.count));
  const maxCat = Math.max(1, ...trends.violationsByCategory.map(v => v.count));
  const maxMissing = Math.max(1, ...trends.commonMissingDeclarations.map(v => v.count));

  const totalViolations = trends.violationsByRule.reduce((acc, v) => acc + v.count, 0);

  return (
    <div className="pb-16">
      <div className="mb-8">
        <PageHeader 
          title="Inspection Analytics" 
          description="Live telemetry and compliance trends from the inspection database." 
        />
      </div>

      {!hasData ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Card>
            <EmptyState
              icon="📊"
              title="No analytics data yet"
              description="Run inspections and compliance checks to generate real-time operational trends."
            />
          </Card>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              label="Total Inspections" 
              value={summary.totalInspections.toLocaleString()} 
              description="Total completed workflows" 
              tone="slate"
              icon="📈"
            />
            <StatCard 
              label="Compliant" 
              value={summary.compliant.toLocaleString()} 
              description="Zero violations detected" 
              tone="emerald" 
              icon="✅"
            />
            <StatCard 
              label="Non-compliant" 
              value={summary.nonCompliant.toLocaleString()} 
              description="Failed automated checks" 
              tone="red" 
              icon="⚠️"
            />
            <StatCard 
              label="Open Violations" 
              value={summary.openViolations.toLocaleString()} 
              description="Awaiting manual resolution" 
              tone="amber" 
              icon="⏳"
            />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            
            {/* Main Visual: Outcomes by Month */}
            <div className="lg:col-span-2">
              <Card title="Inspection Volume & Compliance Outcomes">
                {trends.inspectionOutcomes.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-sm text-slate-500">No outcomes recorded.</div>
                ) : (
                  <div className="mt-4 space-y-6 pb-2">
                    {trends.inspectionOutcomes.map(o => {
                      const max = Math.max(...trends.inspectionOutcomes.map(x => x.total));
                      const widthPct = max > 0 ? (o.total / max) * 100 : 0;
                      
                      const compPct = o.total > 0 ? (o.compliant / o.total) * 100 : 0;
                      const failPct = o.total > 0 ? (o.nonCompliant / o.total) * 100 : 0;
                      const revPct = o.total > 0 ? (o.reviewRequired / o.total) * 100 : 0;

                      return (
                        <div key={o.month} className="group relative">
                          <div className="flex justify-between items-end mb-2">
                            <span className="font-semibold text-slate-700">{new Date(o.month + "-01").toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                            <span className="text-sm font-bold text-slate-500">{o.total.toLocaleString()} total</span>
                          </div>
                          
                          {/* Stacked Bar container */}
                          <div className="h-8 bg-slate-50 rounded-md overflow-hidden flex shadow-inner transition-all duration-700 ease-out border border-slate-100" style={{ width: `${Math.max(8, widthPct)}%` }}>
                            {compPct > 0 && <div className="bg-emerald-500 hover:bg-emerald-400 transition-colors h-full border-r border-white/20" style={{ width: `${compPct}%` }} title={`Compliant: ${o.compliant}`} />}
                            {revPct > 0 && <div className="bg-amber-400 hover:bg-amber-300 transition-colors h-full border-r border-white/20" style={{ width: `${revPct}%` }} title={`Review Required: ${o.reviewRequired}`} />}
                            {failPct > 0 && <div className="bg-red-500 hover:bg-red-400 transition-colors h-full" style={{ width: `${failPct}%` }} title={`Non-compliant: ${o.nonCompliant}`} />}
                          </div>
                          
                          {/* Always-visible Legend / Stats for the month (Inline) */}
                          <div className="flex gap-4 mt-2.5 text-xs">
                            {o.compliant > 0 && <span className="text-emerald-700 font-medium">● {o.compliant} Pass</span>}
                            {o.nonCompliant > 0 && <span className="text-red-700 font-medium">● {o.nonCompliant} Fail</span>}
                            {o.reviewRequired > 0 && <span className="text-amber-700 font-medium">● {o.reviewRequired} Review</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Review Rate & Common Rules */}
            <div className="space-y-8">
              <Card>
                {trends.reviewRate === null ? (
                  <EmptyState icon="👀" title="No Review Data" description="No human reviews recorded yet." />
                ) : (
                  <CircularProgress 
                    percentage={Math.round(trends.reviewRate * 100)} 
                    label="Human Review Rate" 
                    description="The percentage of automated inspections that triggered at least one manual verification step." 
                  />
                )}
              </Card>
              
              <Card title="Common Missing Declarations">
                {trends.commonMissingDeclarations.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">No missing declarations detected.</div>
                ) : (
                  <div className="mt-2 divide-y divide-surface-border">
                    {trends.commonMissingDeclarations.slice(0, 5).map((v, i) => (
                      <VisualBar 
                        key={v.ruleId} 
                        label={v.ruleId} 
                        value={v.count} 
                        max={maxMissing} 
                        tone={i === 0 ? "bg-red-500" : "bg-slate-400"} 
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>

          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Card title="Violations Breakdown by Rule">
              {trends.violationsByRule.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">No violations recorded.</div>
              ) : (
                <div className="divide-y divide-surface-border pr-4">
                  {trends.violationsByRule.map(v => (
                    <VisualBar 
                      key={v.ruleId} 
                      label={v.ruleId} 
                      value={v.count} 
                      max={maxRule} 
                      totalCount={totalViolations}
                      tone="bg-brand" 
                    />
                  ))}
                </div>
              )}
            </Card>

            <Card title="Violations by Product Category">
              {trends.violationsByCategory.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">No category data recorded.</div>
              ) : (
                <div className="divide-y divide-surface-border pr-4">
                  {trends.violationsByCategory.map(v => (
                    <VisualBar 
                      key={v.category} 
                      label={v.category} 
                      value={v.count} 
                      max={maxCat} 
                      tone="bg-indigo-400" 
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
