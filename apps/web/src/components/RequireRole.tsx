import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { ReactNode } from "react";

interface Props {
  roles: Array<"ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER">;
  children: ReactNode;
}

export default function RequireRole({ roles, children }: Props) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <>{children}</>;
}
