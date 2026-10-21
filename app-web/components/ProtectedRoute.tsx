import { Navigate } from "react-router-dom";
import { PropsWithChildren, type JSX } from "react";
import { useAuth } from "../contexts/AuthContext";

interface ProtectedRouteProps extends PropsWithChildren {
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps): JSX.Element {
  const auth = useAuth();

  if (auth.status === "initializing") {
    return <div className="center-card">Restoring session…</div>;
  }

  if (!auth.session) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && !auth.session.isAppAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}
