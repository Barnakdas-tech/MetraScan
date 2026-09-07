import { useEffect, useMemo, useState } from "react";
import type { AnalyzedImage, OcrRegion } from "../types/analysis";
import { loadAuthenticatedImage } from "../lib/imageLoader";
import { useImageGeometry } from "../lib/useImageGeometry";

/**
 * OCR viewer: image + text-region list side by side. Selecting a region
 * highlights its bounding box on the image (bboxes are in ORIGINAL image
 * coordinates; boxes scale as percentages of the displayed image).
 */
export default function OcrViewer({ image, url }: { image: AnalyzedImage; url: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const regions = useMemo(() => image.ocr?.regions ?? [], [image.ocr]);

  useEffect(() => {
    let dead = false;
    let created: string | null = null;
    setObjectUrl(null);
    setLoadError(false);
    loadAuthenticatedImage(url)
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
  }, [url]);

  const selected = useMemo(() => regions.find(r => r.id === selectedId) ?? null, [regions, selectedId]);

  const { geom, imgRef, update: onImgLoad } = useImageGeometry();

  if (image.ocr && image.ocr.success === false) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        OCR failed for this image: {image.ocr.error ?? "unknown error"}. This is a processing observation — not a legal finding.
      </div>
    );
  }
  if (!image.ocr) {
    return (
      <div className="rounded-md border border-surface-border bg-surface px-4 py-6 text-center text-sm text-slate-500">
        No OCR result for this image yet.
      </div>
    );
  }




  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="relative overflow-hidden rounded-md border border-surface-border bg-white">
        {loadError ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">Unable to load image</div>
        ) : objectUrl ? (
          <img ref={imgRef} onLoad={onImgLoad} src={objectUrl} alt={image.originalFilename} className="w-full object-contain" />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-surface-border border-t-brand" />
            Loading image…
          </div>
        )}
        {objectUrl && !loadError && geom.width > 0 && (
          <div className="pointer-events-none absolute" style={{ left: geom.left, top: geom.top, width: geom.width, height: geom.height }}>
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${geom.natW} ${geom.natH}`} preserveAspectRatio="none">
              {regions.map(r => {
                const isSel = r.id === selectedId;
                const fill = isSel ? "rgba(239, 68, 68, 0.2)" : "transparent";
                const stroke = isSel ? "#ef4444" : "rgba(34, 197, 94, 0.6)"; // brand-ish color
                
                if (r.poly && r.poly.length > 0) {
                  const pts = r.poly.map(p => `${p[0]},${p[1]}`).join(" ");
                  return (
                    <polygon
                      key={r.id}
                      points={pts}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isSel ? "4" : "2"}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                } else {
                  const [x, y, w, h] = r.bbox;
                  return (
                    <rect
                      key={r.id}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isSel ? "4" : "2"}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
              })}
            </svg>
          </div>
        )}
      </div>

      <div className="flex max-h-[430px] flex-col overflow-hidden rounded-md border border-surface-border">
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border bg-white px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {regions.length} text region{regions.length === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-slate-400">
            {image.ocr.provider} · {image.ocr.processingMs} ms
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {regions.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">No text detected in this image.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {regions.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                    className={`block w-full px-3 py-2.5 text-left ${selectedId === r.id ? "bg-brand-light" : "hover:bg-surface"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-slate-800">{r.text}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          r.confidence >= 0.9
                            ? "bg-emerald-50 text-emerald-700"
                            : r.confidence >= 0.7
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {(r.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      bbox [{r.bbox.map(v => Math.round(v)).join(", ")}]
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selected && (
          <div className="shrink-0 border-t border-surface-border bg-surface px-3 py-2 text-xs text-slate-600">
            <span className="font-medium">Selected:</span> {selected.text} — highlighted on the image.
          </div>
        )}
      </div>
    </div>
  );
}
