interface CardProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export default function Card({ title, actions, children, className = "", noPadding }: CardProps) {
  return (
    <div className={`rounded-lg border border-surface-border bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {actions}
        </div>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </div>
  );
}
