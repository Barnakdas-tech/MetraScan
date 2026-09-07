import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import { getRule, SerializedRule } from "../../lib/ruleApi";
import { getErrorMessage } from "../../lib/api";

export default function RuleDetailPage() {
  const { ruleId } = useParams<{ ruleId: string }>();
  const [rule, setRule] = useState<SerializedRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!ruleId) return;
      try {
        setRule(await getRule(ruleId));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [ruleId]);

  if (loading) return <LoadingState label={`Loading rule ${ruleId}...`} />;
  if (error || !rule) return <ErrorState message={error || "Rule not found"} retry={() => window.location.reload()} />;

  return (
    <div>
      <PageHeader
        title={rule.title}
        description={`Rule ID: ${rule.ruleId}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={rule.status === "ACTIVE" ? "success" : "default"}>
              {rule.status === "ACTIVE" ? "ACTIVE" : "NOT YET IMPLEMENTED"}
            </Badge>
            <Link to="/app/rules" className="text-sm font-medium text-brand hover:underline">
              &larr; Back to Rules
            </Link>
          </div>
        }
      />
      <div className="mx-auto mt-6 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Conditions & Requirements">
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                {rule.conditions.map((c, idx) => (
                  <li key={idx}>{c.description}</li>
                ))}
              </ul>
            </Card>

            {rule.exceptions && rule.exceptions.length > 0 && (
              <Card title="Exceptions">
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                  {rule.exceptions.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </Card>
            )}

            {rule.notes && (
              <Card title="Notes">
                <p className="text-sm text-slate-700">{rule.notes}</p>
              </Card>
            )}
          </div>

          <Card title="Rule Metadata" className="lg:col-span-1">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Rule Number</dt>
                <dd className="text-right font-medium text-slate-800">{rule.ruleNumber}</dd>
              </div>
              {rule.subRule && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">Sub-Rule</dt>
                  <dd className="text-right font-medium text-slate-800">{rule.subRule}</dd>
                </div>
              )}
              {rule.automation && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">Automation</dt>
                  <dd className="text-right font-medium text-slate-800">{rule.automation}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Engine Version</dt>
                <dd className="text-right font-medium text-slate-800">v{rule.version}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Effective From</dt>
                <dd className="text-right font-medium text-slate-800">{rule.effectiveFrom}</dd>
              </div>
              {rule.effectiveTo && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">Effective To</dt>
                  <dd className="text-right font-medium text-slate-800">{rule.effectiveTo}</dd>
                </div>
              )}
              <div className="flex flex-col gap-1 pt-2">
                <dt className="shrink-0 text-slate-500">Scope</dt>
                <dd className="font-medium text-slate-800">{rule.scope}</dd>
              </div>
              <div className="flex flex-col gap-1 pt-2">
                <dt className="shrink-0 text-slate-500">Source</dt>
                <dd className="font-medium text-slate-800">{rule.source}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
