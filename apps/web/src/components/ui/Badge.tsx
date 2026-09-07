type BadgeTone = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

const tones: Record<BadgeTone, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-brand-light text-brand-dark",
};

export default function Badge({ tone = "default", children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
