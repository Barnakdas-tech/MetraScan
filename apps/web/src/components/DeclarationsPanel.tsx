import { useEffect, useState } from "react";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import { correctDeclaration } from "../lib/inspectionApi";
import { getErrorMessage } from "../lib/api";
import type { Declaration } from "../types/declarations";
import type { InspectionImage } from "../types/inspection";

const FIELD_LABELS: Record<string, string> = {
  manufacturerName: "Manufacturer name",
  manufacturerAddress: "Manufacturer address",
  packerName: "Packer name",
  packerAddress: "Packer address",
  importerName: "Importer name",
  importerAddress: "Importer address",
  countryOfOrigin: "Country of origin",
  genericName: "Generic name",
  netQuantity: "Net quantity",
  mrp: "MRP",
  manufactureDate: "Manufacture date",
  packingDate: "Packing date",
  importDate: "Import date",
  bestBefore: "Best before",
  useBy: "Use by",
  consumerCarePhone: "Consumer care phone",
  consumerCareEmail: "Consumer care email",
  consumerCareAddress: "Consumer care address",
  dimensions: "Dimensions",
  unitSalePrice: "Unit sale price",
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function displayValue(d: Declaration): string {
  const base = d.correctedValue ?? d.normalizedValue ?? "—";
  const unit = d.unit ? " " + d.unit : "";
  const cur = d.currency ? d.currency + " " : "";
  return cur + base + unit;
}

function confTone(c: number | null): "success" | "warning" | "danger" {
  if (c === null) return "warning";
  if (c >= 0.85) return "success";
  if (c >= 0.6) return "warning";
  return "danger";
}

export default function DeclarationsPanel({
  inspectionId,
  declarations,
  images = [],
  onChanged,
}: {
  inspectionId: string;
  declarations: Declaration[];
  images?: InspectionImage[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Declaration | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<Declaration | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setValue(editing.correctedValue ?? editing.normalizedValue ?? "");
      setNote(editing.correctionNote ?? "");
    }
  }, [editing]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await correctDeclaration(inspectionId, editing.id, {
        correctedValue: value.trim() === "" ? null : value.trim(),
        correctionNote: note.trim() === "" ? null : note.trim(),
      });
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const evidenceImg = viewingEvidence?.imageId ? images.find(img => img.id === viewingEvidence.imageId) : null;
  const imgW = evidenceImg?.width ?? 0;
  const imgH = evidenceImg?.height ?? 0;
  
  const toPercent = (bbox: number[]) => {
    const [x, y, w, h] = bbox;
    return {
      left: imgW ? (x / imgW) * 100 : 0,
      top: imgH ? (y / imgH) * 100 : 0,
      width: imgW ? (w / imgW) * 100 : 0,
      height: imgH ? (h / imgH) * 100 : 0,
    };
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Detected value</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Source image</th>
              <th className="px-3 py-2 font-medium">Evidence</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {declarations.map(d => (
              <tr key={d.id} className="border-b border-surface-border last:border-0">
                <td className="px-3 py-2.5 font-medium text-slate-700">{label(d.field)}</td>
                <td className="px-3 py-2.5">
                  <div className="text-slate-800">{displayValue(d)}</div>
                  {d.correctedValue !== null && (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge tone="info">corrected</Badge>
                      <span className="text-xs text-slate-400">AI: {d.normalizedValue ?? "—"}</span>
                    </div>
                  )}
                  <div className="mt-0.5 max-w-xs truncate text-xs text-slate-400" title={d.rawText}>
                    “{d.rawText}”
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={confTone(d.confidence)}>
                    {d.confidence !== null ? Math.round(d.confidence * 100) + "%" : "—"}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {d.image ? `#${d.image.sequence} · ${d.image.originalFilename}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-400">
                  {d.bbox ? (
                    <button onClick={() => setViewingEvidence(d)} className="text-brand hover:underline">
                      bbox [{d.bbox.map(v => Math.round(v)).join(", ")}]
                    </button>
                  ) : d.imageId ? (
                    <button onClick={() => setViewingEvidence(d)} className="text-amber-600 hover:underline">
                      evidence localization is unavailable
                    </button>
                  ) : (
                    "—"
                  )}
                  {d.ocrRegionIds && d.ocrRegionIds.length > 0 && (
                    <span className="ml-1 text-slate-300">· {d.ocrRegionIds.length} region(s)</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>
                    {d.correctedValue !== null ? "Edit correction" : "Correct"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={viewingEvidence !== null}
        onClose={() => setViewingEvidence(null)}
        title={`Evidence for ${viewingEvidence ? label(viewingEvidence.field) : ""}`}
      >
        {viewingEvidence && (
          <div className="space-y-4">
            <div className="rounded-md bg-surface px-3 py-2.5 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">Extracted Text</p>
              <p className="mt-1 font-medium text-slate-800">“{viewingEvidence.rawText}”</p>
            </div>
            
            {evidenceImg ? (
              <div className="relative overflow-hidden rounded-md border border-surface-border bg-white">
                <img src={evidenceImg.url} alt={evidenceImg.originalFilename} className="w-full object-contain" />
                {viewingEvidence.bbox ? (
                  <div className="pointer-events-none absolute inset-0">
                    <div
                      className="absolute border-2 border-red-500 bg-red-500/20"
                      style={{
                        left: toPercent(viewingEvidence.bbox).left + "%",
                        top: toPercent(viewingEvidence.bbox).top + "%",
                        width: toPercent(viewingEvidence.bbox).width + "%",
                        height: toPercent(viewingEvidence.bbox).height + "%",
                      }}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-2 text-center text-sm text-white">
                    Evidence localization is unavailable for this extraction.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-surface-border px-4 py-6 text-center text-sm text-slate-500">
                Source image not available.
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Correct: ${label(editing.field)}` : ""}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} isLoading={saving}>Save correction</Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="rounded-md bg-surface px-3 py-2.5 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">AI-extracted (original, immutable)</p>
              <p className="mt-1 font-medium text-slate-800">{editing.rawText}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Normalized: {editing.normalizedValue ?? "—"}
                {editing.unit ? " " + editing.unit : ""}
                {editing.currency ? " (" + editing.currency + ")" : ""}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Corrected value</label>
              <input
                value={value}
                onChange={e => setValue(e.target.value)}
                className="block w-full rounded-md border border-surface-border px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Correction note (why)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="e.g., sticker price differs from printed MRP"
                className="block w-full rounded-md border border-surface-border px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <p className="text-xs text-slate-400">
              The correction is stored alongside the AI extraction. Original evidence is never overwritten.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
