import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import LoadingState from "./ui/LoadingState";

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Verifying session..." />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}
