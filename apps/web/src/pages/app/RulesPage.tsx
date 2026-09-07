import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";
import { getRules, SerializedRule } from "../../lib/ruleApi";
import { getErrorMessage } from "../../lib/api";

export default function RulesPage() {
  const [rules, setRules] = useState<SerializedRule[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setRules(await getRules());
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading legal rules registry..." />;
  if (error) return <ErrorState message={error} retry={() => window.location.reload()} />;

  const filteredRules = rules.filter(r => {
    const q = search.toLowerCase();
    return (
      r.ruleId.toLowerCase().includes(q) ||
      r.ruleNumber.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.scope.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Legal Rules Registry"
        description="The complete Legal Metrology (Packaged Commodities) Rules, 2011 provision matrix."
      />
      <div className="mx-auto mt-6 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search rules by ID, number, title, or scope..."
            className="w-full max-w-md rounded-md border-surface-border px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Card title="Available Provisions" className="overflow-hidden">
          {rules.length === 0 ? (
            <EmptyState icon="⚖️" title="No rules found" description="The compliance engine has not exposed any rules." />
          ) : filteredRules.length === 0 ? (
            <EmptyState icon="🔍" title="No matching rules" description="Try adjusting your search query." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Rule ID</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Requirement / Title</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr
                      key={rule.ruleId}
                      className="border-b border-surface-border last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-brand">
                        <Link to={`/app/rules/${rule.ruleId}`} className="hover:underline">
                          {rule.ruleId}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">Rule {rule.ruleNumber}</td>
                      <td className="px-4 py-3 text-slate-800">{rule.title}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {rule.status === "ACTIVE" ? (
                          <Badge tone="success">ACTIVE</Badge>
                        ) : (
                          <Badge tone="default">NOT YET IMPLEMENTED</Badge>
                        )}
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
