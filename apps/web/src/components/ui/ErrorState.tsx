interface ErrorStateProps {
  title?: string;
  message: string;
  retry?: () => void;
}

export default function ErrorState({ title = "Something went wrong", message, retry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-xl text-red-500">⚠</div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
      {retry && (
        <button onClick={retry} className="mt-2 rounded-md border border-surface-border px-3 py-1.5 text-sm hover:bg-surface">
          Try again
        </button>
      )}
    </div>
  );
}
