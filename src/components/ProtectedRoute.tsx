import { Navigate } from "react-router-dom";
import { PropsWithChildren } from "react";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ children }: PropsWithChildren): JSX.Element {
  const auth = useAuth();

  if (auth.status === "initializing") {
    return <div className="center-card">Restoring session…</div>;
  }

  if (!auth.session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
