import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

interface NavItem {
  to: string;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ to: "/app/dashboard", label: "Dashboard" }],
  },
  {
    title: "Inspections",
    items: [
      { to: "/app/inspection/new", label: "New Inspection" },
      { to: "/app/inspections", label: "Inspection History" },
    ],
  },
  {
    title: "Products",
    items: [
      { to: "/app/products", label: "Products" },
      { to: "/app/repository", label: "Product Repository" },
    ],
  },
  {
    title: "Compliance",
    items: [
      { to: "/app/violations", label: "Violations" },
      { to: "/app/rules", label: "Rules" },
    ],
  },
  {
    title: "Reports",
    items: [{ to: "/app/reports", label: "Reports" }],
  },
  {
    title: "Analytics",
    items: [{ to: "/app/analytics", label: "Analytics" }],
  },
  {
    title: "System",
    items: [{ to: "/app/settings", label: "Settings" }],
  },
];

export default function Sidebar() {
  const { user } = useAuth();
  const canInspect = user?.role === "ADMIN" || user?.role === "INSPECTOR";
  const sections = SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (item.to.startsWith("/app/inspection/new") || item.to === "/app/scan") return canInspect;
      return true;
    }),
  })).filter(section => section.items.length > 0);
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-border bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-surface-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
          MS
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">MetraScan</p>
          <p className="text-[11px] text-slate-500">Legal Metrology Platform</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map(section => (
          <div key={section.title} className="mb-5">
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.title}
            </p>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-2.5 py-2 text-sm ${isActive ? "bg-brand-light font-medium text-brand-dark" : "text-slate-600 hover:bg-surface"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-surface-border p-4 text-[11px] leading-relaxed text-slate-400">
        MetraScan is an AI-assisted inspection system. It supports — and never replaces — the Legal Metrology Officer.
      </div>
    </aside>
  );
}
