import { useEffect, useState } from "react";
import { loadAuthenticatedImage } from "../lib/imageLoader";
import { useImageGeometry } from "../lib/useImageGeometry";

export interface EvidenceBox {
  bbox: number[];
  poly?: [number, number][];
  label: string;
  kind: "POSITIVE" | "NEGATIVE" | "REVIEW";
  text?: string;
}

/** Build evidence boxes from declarations for a given image. */
export function declarationBoxes(
  declarations: { field: string; imageId: string | null; bbox: number[] | null; poly?: [number, number][] | null; confidence: number | null; rawText: string }[],
  imageId: string
): EvidenceBox[] {
  return declarations
    .filter(d => d.imageId === imageId && Array.isArray(d.bbox) && d.bbox.length === 4)
    .map(d => ({
      bbox: d.bbox as number[],
      poly: d.poly ?? undefined,
      label: d.field,
      kind: (d.confidence ?? 0) >= 0.7 ? "POSITIVE" : "REVIEW",
      text: d.rawText,
    }));
}

/**
 * Evidence-first image viewer: renders declaration/OCR/violation boxes over
 * the source image with non-color cues (icon + label + border style) so the
 * evidence type is never conveyed by color alone.
 */
export default function EvidenceViewer({ imageUrl, imageWidth, imageHeight, boxes }: {
  imageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  boxes: EvidenceBox[];
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let dead = false;
    let created: string | null = null;
    setObjectUrl(null);
    setLoadError(false);
    loadAuthenticatedImage(imageUrl)
      .then(u => {
        if (dead) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setObjectUrl(u);
      })
      .catch(() => setLoadError(true));
    return () => {
      dead = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [imageUrl]);

  const { geom, imgRef, update: onImgLoad } = useImageGeometry();

  const toPercent = (bbox: number[]) => {
    const [x, y, w, h] = bbox;
    const { natW, natH } = geom;
    return {
      left: natW ? (x / natW) * 100 : 0,
      top: natH ? (y / natH) * 100 : 0,
      width: natW ? (w / natW) * 100 : 0,
      height: natH ? (h / natH) * 100 : 0,
    };
  };

  const kindStyle: Record<EvidenceBox["kind"], string> = {
    POSITIVE: "border-emerald-600 border-solid",
    NEGATIVE: "border-red-600 border-dashed",
    REVIEW: "border-amber-500 border-dotted",
  };
  const kindIcon: Record<EvidenceBox["kind"], string> = {
    POSITIVE: "✓",
    NEGATIVE: "✕",
    REVIEW: "?",
  };
  const kindBadge: Record<EvidenceBox["kind"], string> = {
    POSITIVE: "bg-emerald-600",
    NEGATIVE: "bg-red-600",
    REVIEW: "bg-amber-500",
  };

  return (
    <div className="relative overflow-hidden rounded-md border border-surface-border bg-white">
      {loadError ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">Unable to load image</div>
      ) : objectUrl ? (
        <img ref={imgRef} onLoad={onImgLoad} src={objectUrl} alt="package evidence" className="w-full object-contain" />
      ) : (
        <div className="flex h-64 items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-surface-border border-t-brand" />
        </div>
      )}
      {objectUrl && !loadError && geom.width > 0 && (
        <div className="pointer-events-none absolute" style={{ left: geom.left, top: geom.top, width: geom.width, height: geom.height }}>
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${geom.natW} ${geom.natH}`} preserveAspectRatio="none">
            {boxes
              .filter(b => Array.isArray(b.bbox) && b.bbox.length === 4)
              .map((b, i) => {
                const strokeColor = b.kind === "POSITIVE" ? "#059669" : b.kind === "NEGATIVE" ? "#dc2626" : "#f59e0b";
                const strokeDasharray = b.kind === "NEGATIVE" ? "10,10" : b.kind === "REVIEW" ? "4,4" : "none";
                
                if (b.poly && b.poly.length > 0) {
                  const pts = b.poly.map(p => `${p[0]},${p[1]}`).join(" ");
                  return (
                    <polygon
                      key={i}
                      points={pts}
                      fill="transparent"
                      stroke={strokeColor}
                      strokeWidth="4"
                      strokeDasharray={strokeDasharray}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                } else {
                  const [x, y, w, h] = b.bbox;
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill="transparent"
                      stroke={strokeColor}
                      strokeWidth="4"
                      strokeDasharray={strokeDasharray}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
              })}
          </svg>
          {boxes
            .filter(b => Array.isArray(b.bbox) && b.bbox.length === 4)
            .map((b, i) => {
              const pos = toPercent(b.bbox);
              // For the label position, use the bounding box top-left corner
              return (
                <div key={`label-${i}`} className="absolute" style={{ left: pos.left + "%", top: pos.top + "%", width: pos.width + "%", height: pos.height + "%" }}>
                  <span className={"absolute -top-5 left-0 flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white " + kindBadge[b.kind]}>
                    <span aria-hidden>{kindIcon[b.kind]}</span>
                    {b.label}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
