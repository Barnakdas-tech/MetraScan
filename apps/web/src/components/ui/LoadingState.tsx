export default function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-border border-t-brand" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
