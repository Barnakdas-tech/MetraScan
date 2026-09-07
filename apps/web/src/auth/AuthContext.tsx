import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER";
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const verify = useCallback(async () => {
    const token = localStorage.getItem("metrascan.token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ success: boolean; data: AuthUser }>("/auth/me");
      setUser(res.data.data);
    } catch {
      localStorage.removeItem("metrascan.token");
      localStorage.removeItem("metrascan.user");
      setUser(null);
    } finally {
      setLoading(false);
    }
    },
  []);

  useEffect(() => {
    void verify();
  }, [verify]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ success: boolean; data: { token: string; user: AuthUser } }>("/auth/login", {
      email,
      password,
    });
    localStorage.setItem("metrascan.token", res.data.data.token);
    localStorage.setItem("metrascan.user", JSON.stringify(res.data.data.user));
    setUser(res.data.data.user);
  }, []);

  const logout = useCallback(() => {
    void api.post("/auth/logout").catch(() => undefined);
    localStorage.removeItem("metrascan.token");
    localStorage.removeItem("metrascan.user");
    setUser(null);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    await api.post("/auth/register", { name, email, password });
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
