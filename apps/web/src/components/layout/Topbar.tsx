import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-surface-border bg-white px-6">
      <div className="hidden text-sm font-medium text-slate-500 md:block">
        Government of India · Legal Metrology (Packaged Commodities) Rules, 2011
      </div>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="flex items-center gap-2.5 rounded-md border border-surface-border px-3 py-1.5 hover:bg-surface"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand">
            {user?.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <span className="text-sm font-medium text-slate-700">{user?.name ?? "User"}</span>
          <span className="rounded bg-brand-light px-1.5 py-0.5 text-[10px] font-semibold text-brand-dark">
            {user?.role ?? ""}
          </span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-11 w-44 rounded-md border border-surface-border bg-white py-1 shadow-md">
            <div className="border-b border-surface-border px-3 py-2 text-xs text-slate-500">
              Signed in as <span className="font-medium">{user?.email}</span>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
                navigate("/login");
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-surface"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
