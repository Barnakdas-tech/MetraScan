import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../lib/api";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";

function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 font-sans">
      {/* Tricolor-style Top Accent Line */}
      <div className="flex h-1.5 w-full">
        <div className="flex-1 bg-orange-400"></div>
        <div className="flex-1 bg-white"></div>
        <div className="flex-1 bg-green-600"></div>
      </div>
      
      {/* Institutional Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm z-10 shrink-0">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-brand text-xs font-bold text-white">
              MS
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">MetraScan</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">Legal Metrology Platform</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Centered Cohesive Block */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 w-full mx-auto max-w-7xl">
        <div className="w-full max-w-[960px] bg-white border border-slate-300 shadow-sm rounded flex flex-col lg:flex-row overflow-hidden">
          
          {/* Left Official Departmental Panel */}
          <div className="w-full lg:w-5/12 bg-slate-100 border-b lg:border-b-0 lg:border-r border-slate-200 p-8 sm:p-10 relative flex flex-col">
            {/* Narrow blue vertical rule/accent */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand"></div>
            
            {/* Departmental Metadata */}
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-6">
              Official Departmental System
            </p>
            
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand text-base font-bold text-white shadow-sm">
                MS
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">MetraScan</h1>
            </div>

            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-5">
              Legal Metrology Inspection Platform
            </h2>
            
            {/* Document-style separator */}
            <div className="border-t-2 border-slate-200 border-dashed w-full my-6"></div>
            
            <p className="text-[14px] font-semibold text-slate-800 mb-2">
              Government Inspection & Compliance System
            </p>
            <p className="text-[13px] text-slate-600 leading-relaxed mb-8">
              Authorized departmental personnel only. Access the system to conduct inspections, review compliance, and manage legal metrology enforcement.
            </p>
            
            <div className="mt-auto flex flex-col gap-5">
              <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-bold uppercase tracking-wide text-slate-700">Notice:</span> Unauthorized access to this government system is strictly prohibited. Please use official credentials.
                </p>
              </div>

              {/* Factual System Information */}
              <div className="border-t border-slate-200 pt-5">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">
                      Departmental System
                    </p>
                    <p className="text-[11.5px] font-medium text-slate-700">
                      Legal Metrology Inspection & Compliance
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">
                      System Access
                    </p>
                    <p className="text-[11.5px] font-medium text-slate-700">
                      Authorized Personnel Only
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Auth Form */}
          <div className="w-full lg:w-7/12 p-8 sm:p-12 lg:p-16 flex flex-col justify-center bg-white">
            <div className="w-full max-w-[360px] mx-auto">
              {children}
            </div>
          </div>

        </div>
      </main>

      {/* Simple Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 shrink-0 mt-auto">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          &copy; {new Date().getFullYear()} MetraScan &bull; Legal Metrology Inspection Platform
        </div>
      </footer>
    </div>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(name, email, password);
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplitLayout>
      {/* Register Header */}
      <div className="mb-8 border-b border-slate-100 pb-5">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Create an account</h2>
        <p className="mt-1.5 text-[13px] text-slate-500">Register for official platform access.</p>
      </div>
      
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-6 rounded bg-red-50 border border-red-200 p-3 text-sm font-medium text-red-800 flex items-start gap-2">
            <svg className="w-5 h-5 shrink-0 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <Input 
            id="name" 
            label="Full Name" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            required 
            minLength={2} 
            className="[&>label]:font-semibold [&>label]:text-slate-700 [&>label]:text-[13px] [&>input]:h-[42px] [&>input]:bg-white [&>input]:border-slate-300 [&>input]:rounded [&>input]:focus:border-brand [&>input]:focus:ring-1 [&>input]:focus:ring-brand"
          />
          <Input
            id="email"
            type="email"
            label="Email Address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="[&>label]:font-semibold [&>label]:text-slate-700 [&>label]:text-[13px] [&>input]:h-[42px] [&>input]:bg-white [&>input]:border-slate-300 [&>input]:rounded [&>input]:focus:border-brand [&>input]:focus:ring-1 [&>input]:focus:ring-brand"
          />
          <Input
            id="password"
            type="password"
            label="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="[&>label]:font-semibold [&>label]:text-slate-700 [&>label]:text-[13px] [&>input]:h-[42px] [&>input]:bg-white [&>input]:border-slate-300 [&>input]:rounded [&>input]:focus:border-brand [&>input]:focus:ring-1 [&>input]:focus:ring-brand"
          />
        </div>
        
        <Button type="submit" className="mt-7 w-full shadow-none rounded h-[42px] text-sm font-semibold tracking-wide bg-brand hover:bg-brand-dark transition-colors" isLoading={loading}>
          Create Account
        </Button>
        
        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <p className="text-[13px] text-slate-500">
            Already registered? <Link to="/login" className="font-semibold text-brand hover:text-brand-dark hover:underline underline-offset-4">Sign in securely</Link>
          </p>
        </div>
      </form>
    </AuthSplitLayout>
  );
}
