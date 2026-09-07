import { useState, useCallback, useRef } from "react";

/**
 * Computes the rendered geometry of an `<img>` that uses `object-fit: contain`.
 *
 * Returns:
 *  - `geom.left/top/width/height` — the pixel rect of the *rendered image*
 *    inside the `<img>` element (accounts for letterboxing).
 *  - `geom.natW/natH` — the natural (intrinsic) pixel dimensions of the source.
 *  - `imgRef` — assign to the `<img>` element's `ref` prop.
 *  - `update` — call as the `onLoad` handler so geometry is calculated once
 *    the image's `naturalWidth`/`naturalHeight` are available.
 *
 * A `ResizeObserver` automatically recalculates when the element resizes
 * (e.g. the browser window is resized).
 */
export function useImageGeometry() {
  const [geom, setGeom] = useState({ left: 0, top: 0, width: 0, height: 0, natW: 1, natH: 1 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const recalc = useCallback(() => {
    const img = imgElRef.current;
    if (!img) return;
    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
    if (!naturalWidth || !naturalHeight || !clientWidth || !clientHeight) return;

    const imgRatio = naturalWidth / naturalHeight;
    const containerRatio = clientWidth / clientHeight;

    let rw: number;
    let rh: number;

    if (containerRatio > imgRatio) {
      // Image is narrower than the container — pillarboxed (bars on left/right)
      rh = clientHeight;
      rw = clientHeight * imgRatio;
    } else {
      // Image is wider than the container — letterboxed (bars on top/bottom)
      rw = clientWidth;
      rh = clientWidth / imgRatio;
    }

    setGeom({
      left: (clientWidth - rw) / 2,
      top: (clientHeight - rh) / 2,
      width: rw,
      height: rh,
      natW: naturalWidth,
      natH: naturalHeight,
    });
  }, []);

  // Callback ref: attaches/detaches the ResizeObserver when the element mounts/unmounts.
  const imgRef = useCallback(
    (node: HTMLImageElement | null) => {
      // Disconnect previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      imgElRef.current = node;
      if (node) {
        const ro = new ResizeObserver(() => recalc());
        ro.observe(node);
        observerRef.current = ro;
      }
    },
    [recalc],
  );

  return { geom, imgRef, update: recalc };
}
