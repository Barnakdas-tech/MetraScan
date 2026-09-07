import { Navigate } from "react-router-dom";

export default function AppRedirect() {
  // If authenticated, go to the app; otherwise to login. Token presence is
  // verified by the API on first protected call; the shell simply routes.
  const token = localStorage.getItem("metrascan.token");
  return <Navigate to={token ? "/app/dashboard" : "/login"} replace />;
}
