import { Link } from "react-router-dom";
import { PropsWithChildren } from "react";
import { useAuth } from "../contexts/AuthContext";

export function Layout({ children }: PropsWithChildren): JSX.Element {
  const auth = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-branding">
          <Link to="/home" className="brand">
            Quick Expense
          </Link>
          <p className="muted small topbar-meta">{auth.session?.email ?? "Not signed in"}</p>
        </div>

        {auth.session ? (
          <nav className="topbar-actions">
            <button className="ghost-button" onClick={auth.signOut} type="button">
              Sign out
            </button>
          </nav>
        ) : null}
      </header>

      <main className="page-container">{children}</main>
    </div>
  );
}
