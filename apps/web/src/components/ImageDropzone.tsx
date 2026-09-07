import { useCallback, useState } from "react";

interface ImageDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPT = ".jpg,.jpeg,.png,.webp";
const MAX_BYTES = 10 * 1024 * 1024;

export default function ImageDropzone({ onFiles, disabled }: ImageDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || disabled) return;
      const files = Array.from(list);
      const valid = files.filter(f =>
        ["image/jpeg", "image/png", "image/webp"].includes(f.type) && f.size > 0 && f.size <= MAX_BYTES
      );
      // Silently dropping invalid files here is fine — the backend re-validates
      // authoritatively and reports per-file failures.
      if (valid.length > 0) onFiles(valid);
    },
    [disabled, onFiles]
  );

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-brand bg-brand-light" : "border-surface-border bg-surface"} ${disabled ? "opacity-50" : ""}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-lg text-brand shadow-sm">＋</div>
      <p className="text-sm font-medium text-slate-700">
        Drag &amp; drop package images, or{" "}
        <label
          className={`font-medium text-brand ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:underline"}`}
        >
          browse files
          <input
            type="file"
            accept={ACCEPT}
            multiple
            disabled={disabled}
            className="sr-only"
            onChange={e => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </p>
      <p className="text-xs text-slate-400">JPEG, PNG, or WEBP · up to 10 MB each · multiple files welcome</p>
    </div>
  );
}
