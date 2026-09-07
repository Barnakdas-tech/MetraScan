import Badge from "./ui/Badge";
import type { ApplicabilityDecision, ApplicabilityResult } from "../types/applicability";

function DecisionRow({ d }: { d: ApplicabilityDecision }) {
  const label = d.subRule ? `Rule ${d.ruleNumber}(${d.subRule})` : `Rule ${d.ruleNumber}`;
  return (
    <tr className="border-b border-surface-border last:border-0 align-top">
      <td className="px-3 py-2.5">
        <div className="font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{d.title}</div>
      </td>
      <td className="px-3 py-2.5">
        {d.status === "APPLICABLE" && <Badge tone="success">Applicable</Badge>}
        {d.status === "NOT_APPLICABLE" && <Badge tone="default">Not applicable</Badge>}
        {d.status === "REVIEW" && <Badge tone="warning">Review</Badge>}
      </td>
      <td className="px-3 py-2.5 text-xs leading-relaxed text-slate-600">
        {d.reason}
        <div className="mt-1 text-slate-400">{d.source}</div>
        {d.exceptions && d.exceptions.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-500">
              {d.exceptions.length} source exception(s)
            </summary>
            <ul className="mt-1 list-disc pl-4 text-slate-400">
              {d.exceptions.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}
      </td>
    </tr>
  );
}

export default function ApplicableRulesPanel({ result }: { result: ApplicabilityResult }) {
  return (
    <div>
      <div className="mb-3 rounded-md bg-surface px-3 py-2 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Legal version in force:</span> {result.resolvedLegalVersion}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Provision</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {result.applicableRules.map(d => <DecisionRow key={d.ruleId} d={d} />)}
            {result.nonApplicableRules.map(d => <DecisionRow key={d.ruleId} d={d} />)}
            {result.reviewRequiredRules.map(d => <DecisionRow key={d.ruleId} d={d} />)}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-surface-border pt-2 text-xs text-slate-400">{result.note}</p>
    </div>
  );
}
