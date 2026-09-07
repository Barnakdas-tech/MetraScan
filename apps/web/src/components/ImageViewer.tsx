import { useState } from "react";
import { useEffect } from "react";
import { loadAuthenticatedImage } from "../lib/imageLoader";

interface ImageViewerProps {
  src: string;
  zoomSrc?: string;
  alt: string;
  caption?: string;
}

/**
 * Reusable image viewer foundation. Today: plain display. Later phases will
 * overlay bounding boxes / OCR regions / violation highlights — the overlay
 * prop is reserved for that; none are rendered until real data exists.
 */
export default function ImageViewer({ src, zoomSrc, alt, caption }: ImageViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const [error, setError] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    setObjectUrl(null);
    setError(false);
    loadAuthenticatedImage(src)
      .then(url => {
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setObjectUrl(url);
      })
      .catch(() => setError(true));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    let created: string | null = null;
    setZoomUrl(null);
    if (!zoomed || !zoomSrc || zoomSrc === src) return;
    loadAuthenticatedImage(zoomSrc)
      .then(u => {
        if (dead) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setZoomUrl(u);
      })
      .catch(() => setZoomUrl(null));
    return () => {
      dead = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [zoomed, zoomSrc, src]);

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-surface-border bg-surface text-sm text-slate-400">
        Unable to load image
      </div>
    );
  }

  return (
    <>
      {objectUrl ? (
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="block w-full overflow-hidden rounded-md border border-surface-border bg-white"
      >
        <img
          src={objectUrl}
          alt={alt}
          onError={() => setError(true)}
          className="h-48 w-full cursor-zoom-in object-contain"
          loading="lazy"
        />
      </button>
      ) : !error ? (
        <div className="flex h-48 w-full items-center justify-center rounded-md border border-surface-border bg-surface">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-surface-border border-t-brand" />
        </div>
      ) : null}
      {caption && <p className="mt-1.5 truncate text-xs text-slate-500">{caption}</p>}
      {zoomed && objectUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-8"
          onClick={() => setZoomed(false)}
        >
          <img src={zoomUrl ?? objectUrl} alt={alt} className="max-h-full max-w-full rounded-md object-contain shadow-xl" />
        </div>
      )}
    </>
  );
}
