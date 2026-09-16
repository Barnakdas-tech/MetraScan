import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import EvidenceViewer from "./EvidenceViewer";
import { submitReview, submitForReview } from "../lib/inspectionApi";
import { getErrorMessage } from "../lib/api";
import type { Declaration } from "../types/declarations";
import type { InspectionImage } from "../types/inspection";
import type { StoredValidationResult, ConflictItem } from "../types/review";

const RULE_REQUIREMENTS: Record<string, string> = {
  "R6.1a": "Name and complete address of the manufacturer/packer (importer for imported packages).",
  "R6.1b": "The common or generic name of the commodity contained in the package.",
  "R6.1c": "The net quantity in standard units of weight, measure, or number.",
  "R6.1d": "The month and year of manufacture, pre-pack, or import.",
  "R6.1e": "The retail sale price of the package (MRP inclusive of all taxes).",
  "R6.2": "Name, address, telephone number, and email (if available) for consumer complaints.",
  "R7.2": "Minimum numeral height on the principal display panel per Rule 7(2) Tables I/II.",
  "R8.1": "Clear space around the quantity declaration free from printed information.",
  "R9.1b": "Price and quantity numerals printed in a contrasting colour.",
  "R12.6": "Quantity declaration must not contain misleading qualifying words.",
  "R13.4": "No archaic counting terms (dozen, score, gross) on the package.",
  "R14": "Dimensions and number declared for textile-type commodities.",
};

const STATUS_LABEL: Record<string, string> = {
  PASS: "PASS",
  FAIL: "FAIL",
  REVIEW: "REVIEW",
  NOT_APPLICABLE: "NOT APPLICABLE",
  MANUAL_REQUIRED: "MANUAL REQUIRED",
};

const RESULT_CUE: Record<string, { icon: string; tone: "success" | "danger" | "warning" | "default" }> = {
  PASS: { icon: "✓", tone: "success" },
  FAIL: { icon: "✕", tone: "danger" },
  REVIEW: { icon: "?", tone: "warning" },
  NOT_APPLICABLE: { icon: "—", tone: "default" },
  MANUAL_REQUIRED: { icon: "⚠", tone: "warning" },
};

export default function ResultDetailModal({
  open,
  onClose,
  result,
  declarations: _declarations,
  images,
  inspectionId,
  onReviewed,
}: {
  open: boolean;
  onClose: () => void;
  result: StoredValidationResult | null;
  declarations: Declaration[];
  images: InspectionImage[];
  inspectionId: string;
  onReviewed: () => void;
}) {
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedConflictImageId, setSelectedConflictImageId] = useState<string | null>(null);

  const { user } = useAuth();
  const canReview = user?.role === "ADMIN" || user?.role === "REVIEWER";
  const [submittingForReview, setSubmittingForReview] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    setComment("");
    setError(null);
    setSelectedConflictImageId(null);
    setSubmitSuccess(false);
  }, [result]);

  const handleSubmitForReview = async () => {
    setSubmittingForReview(true);
    setError(null);
    try {
      await submitForReview(inspectionId, `Rule ${result?.ruleId ?? ""} submitted for review.`);
      setSubmitSuccess(true);
      onReviewed();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmittingForReview(false);
    }
  };


  if (!result) return null;

  const requirement = RULE_REQUIREMENTS[result.ruleId] ?? "See applicable rule explanation.";
  const conflictData = result.evidence?.conflict;
  const activeImageId = selectedConflictImageId ?? result.evidence?.imageId;
  const evidenceImage = activeImageId
    ? images.find(i => i.id === activeImageId) ?? images[0]
    : images[0];

  const activeBox = (selectedConflictImageId && conflictData)
    ? conflictData.conflicting?.find((c: ConflictItem) => c.imageId === selectedConflictImageId)?.bbox ?? result.evidence?.bbox
    : result.evidence?.bbox;
  const activeText = (selectedConflictImageId && conflictData)
    ? conflictData.conflicting?.find((c: ConflictItem) => c.imageId === selectedConflictImageId)?.text ?? result.evidence?.text
    : result.evidence?.text;

  const effectiveStatus = result.humanStatus ?? result.status;

  const act = async (action: string, newValue?: string) => {
    setActing(newValue ? `${action}_${newValue}` : action);
    setError(null);
    try {
      await submitReview(inspectionId, {
        action,
        targetId: result!.id,
        ruleId: result!.ruleId,
        comment: comment.trim() === "" ? null : comment.trim(),
        newValue: newValue ?? undefined,
      });
      onReviewed();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActing(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={"Rule " + result.ruleId + " — " + STATUS_LABEL[result.status]} width="max-w-4xl">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: WHAT/WHERE/WHY/CONFIDENCE/EVIDENCE */}
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Requirement</p>
            <p className="mt-1 text-slate-800">{requirement}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why this status</p>
            <p className="mt-1 text-slate-800">{result.reason}</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Confidence</p>
              <p className="mt-1 font-medium text-slate-800">{Math.round(result.confidence * 100)}%</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Validator</p>
              <p className="mt-1 text-slate-800">{result.validatorVersion ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI status</p>
              <p className="mt-1">
                <Badge tone={RESULT_CUE[result.status]?.tone ?? "default"}>
                  {RESULT_CUE[result.status]?.icon} {STATUS_LABEL[result.status]}
                </Badge>
              </p>
            </div>
            {result.humanStatus && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Human decision</p>
                <p className="mt-1">
                  <Badge tone={RESULT_CUE[result.humanStatus]?.tone ?? "default"}>
                    {RESULT_CUE[result.humanStatus]?.icon} {STATUS_LABEL[result.humanStatus]}
                  </Badge>
                </p>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Source</p>
            <p className="mt-1 text-xs text-slate-500">{result.source ?? "—"}</p>
          </div>
          {result.humanComment && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reviewer comment</p>
              <p className="mt-1 text-slate-700">{result.humanComment}</p>
            </div>
          )}
        </div>

        {/* Right: source image with highlighted evidence */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Source image &amp; highlighted evidence
          </p>

          {conflictData && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              <p className="font-semibold text-amber-900">Cross-Image Conflict Evidence:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedConflictImageId(null)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    !selectedConflictImageId
                      ? "bg-amber-800 text-white shadow-sm"
                      : "border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  Primary (Image #{images.find(i => i.id === (conflictData.primary?.imageId ?? result.evidence?.imageId))?.sequence ?? 1})
                </button>
                {conflictData.conflicting?.map((c: ConflictItem, i: number) => {
                  const img = images.find(im => im.id === c.imageId);
                  const isSelected = selectedConflictImageId === c.imageId;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedConflictImageId(c.imageId)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                        isSelected
                          ? "bg-amber-800 text-white shadow-sm"
                          : "border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                      }`}
                    >
                      Conflict #{i + 1} ({img ? `Image #${img.sequence}` : "Image"}): “{c.text}”
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {evidenceImage ? (
            <>
              <EvidenceViewer
                imageUrl={evidenceImage.url}
                imageWidth={evidenceImage.width}
                imageHeight={evidenceImage.height}
                boxes={
                  activeBox
                    ? [{
                        bbox: activeBox,
                        label: result.ruleId,
                        kind: result.status === "PASS" ? "POSITIVE" : result.status === "FAIL" ? "NEGATIVE" : "REVIEW",
                        text: activeText ?? undefined,
                      }]
                    : []
                }
              />
              {!activeBox && (
                <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <span className="font-semibold text-amber-800">Evidence localization is unavailable.</span> The image is provided for manual inspection, but specific coordinates were not detected.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-surface-border px-4 py-10 text-center text-sm text-slate-400">
              No image available for this evidence.
            </div>
          )}
          {activeText && (
            <p className="text-xs text-slate-600">
              <span className="font-semibold">Detected text:</span> “{activeText}”
            </p>
          )}
        </div>
      </div>

      {/* Review actions */}
      <div className="mt-5 border-t border-surface-border pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Human review — effective status: {STATUS_LABEL[effectiveStatus]}
        </p>
        
        {canReview ? (
          <>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={2}
              placeholder="Comment (required for reject/change; recorded in the audit trail)"
              className="mb-3 block w-full rounded-md border border-surface-border px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="flex flex-wrap gap-2">
              {result.status === "REVIEW" || result.status === "MANUAL_REQUIRED" ? (
                <>
                  <Button variant="secondary" onClick={() => act("CHANGE_RESULT", "PASS")} isLoading={acting === "CHANGE_RESULT_PASS"}>
                    ✓ Resolve as PASS
                  </Button>
                  <Button variant="danger" onClick={() => act("CHANGE_RESULT", "FAIL")} isLoading={acting === "CHANGE_RESULT_FAIL"}>
                    ✕ Resolve as FAIL
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => act("ACCEPT")} isLoading={acting === "ACCEPT"}>
                    ✓ Accept AI finding
                  </Button>
                  <Button variant="danger" onClick={() => act("REJECT")} isLoading={acting === "REJECT"}>
                    ✕ Reject AI finding
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => act("MARK_MANUAL")} isLoading={acting === "MARK_MANUAL"}>
                ⚠ Mark manual inspection
              </Button>
              <Button variant="ghost" onClick={() => act("COMMENT")} isLoading={acting === "COMMENT"}>
                💬 Add comment only
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Reviews are audited and stored beside — never over — the AI result. The original AI status remains visible.
            </p>
          </>
        ) : user?.role === "INSPECTOR" ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <span className="text-base">⚠</span> HUMAN REVIEW REQUIRED
            </div>
            <p className="mt-1 text-xs text-amber-800">
              AI could not safely determine the final compliance outcome.
            </p>
            <p className="mt-0.5 text-xs font-medium text-amber-900">
              Final decision must be made by a Reviewer or Administrator.
            </p>
            {error && <div className="mt-2 rounded-md bg-red-100 p-2 text-xs text-red-800">{error}</div>}
            {submitSuccess ? (
              <p className="mt-3 text-xs font-medium text-emerald-800">
                ✓ Inspection has been submitted to the Review Queue.
              </p>
            ) : (
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={handleSubmitForReview}
                  isLoading={submittingForReview}
                >
                  Submit for Review
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-600 border border-slate-200">
            <span className="font-semibold text-slate-700 block mb-0.5">Read-only view</span>
            Viewer accounts have read-only access. Mutation and review actions are restricted.
          </div>
        )}
      </div>

    </Modal>
  );
}
