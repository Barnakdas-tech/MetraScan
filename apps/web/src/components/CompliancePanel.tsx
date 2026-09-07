import { useState } from "react";
import Badge from "./ui/Badge";
import ResultDetailModal from "./ResultDetailModal";
import type { ComplianceResult } from "../types/compliance";
import type { StoredValidationResult } from "../types/review";
import type { Declaration } from "../types/declarations";
import type { InspectionImage } from "../types/inspection";

const STATUS_TONES: Record<string, "success" | "danger" | "warning" | "default"> = {
  PASS: "success",
  FAIL: "danger",
  REVIEW: "warning",
  MANUAL_REQUIRED: "warning",
  NOT_APPLICABLE: "default",
};
const STATUS_ICONS: Record<string, string> = {
  PASS: "✓",
  FAIL: "✕",
  REVIEW: "?",
  MANUAL_REQUIRED: "⚠",
  NOT_APPLICABLE: "—",
};

export default function CompliancePanel({
  result,
  inspectionId,
  declarations,
  images,
  onReviewed,
  storedResults,
}: {
  result: ComplianceResult;
  inspectionId: string;
  declarations: Declaration[];
  images: InspectionImage[];
  onReviewed: () => void;
  storedResults: StoredValidationResult[];
}) {
  const [selected, setSelected] = useState<StoredValidationResult | null>(null);

  const verdictTone = result.verdict === "COMPLIANT" ? "success" : result.verdict === "NON_COMPLIANT" ? "danger" : "warning";
  const ordered = [...result.results].sort((a, b) => {
    const order = { FAIL: 0, REVIEW: 1, MANUAL_REQUIRED: 2, PASS: 3, NOT_APPLICABLE: 4 };
    return order[a.status] - order[b.status];
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-surface px-3 py-2 text-sm">
        <span className="font-medium text-slate-600">Verdict:</span>
        <Badge tone={verdictTone as never}>{result.verdict.replace("_", " ")}</Badge>
        <span className="text-xs text-slate-500">
          {result.summary.passed} pass · {result.summary.failed} fail · {result.summary.review} review · {result.summary.manualRequired} manual
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Rule</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => {
              const stored = storedResults.find(s => s.ruleId === r.ruleId) ?? null;
              const effectiveStatus = stored?.humanStatus ?? r.status;
              return (
                <tr
                  key={r.ruleId + i}
                  onClick={() => {
                    setSelected(stored ?? ({ ...r, id: "", humanStatus: null, humanComment: null } as StoredValidationResult));
                  }}
                  className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface"
                >
                  <td className="px-3 py-2.5 font-medium text-brand">{r.ruleId}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={STATUS_TONES[effectiveStatus] ?? "default"}>
                      {STATUS_ICONS[effectiveStatus]} {effectiveStatus.replace("_", " ")}
                    </Badge>
                    {stored?.humanStatus && (
                      <div className="mt-1 text-[10px] font-medium tracking-wide text-brand uppercase">
                        Human Reviewed
                      </div>
                    )}
                    {!stored?.humanStatus && (
                      <div className="mt-1 text-xs text-slate-400">{Math.round(r.confidence * 100)}%</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs leading-relaxed text-slate-600">{r.reason}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {r.evidence?.text ? <span className="text-slate-600">“{r.evidence.text}”</span> : "—"}
                    {r.evidence?.bbox && <div className="mt-0.5">bbox [{r.evidence.bbox.map(v => Math.round(v)).join(", ")}]</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-surface-border pt-2 text-xs text-slate-400">
        Click any row for full evidence, the rule requirement, and review options. {result.note}
      </p>

      <ResultDetailModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        result={selected}
        declarations={declarations}
        images={images}
        inspectionId={inspectionId}
        onReviewed={onReviewed}
      />
    </div>
  );
}
