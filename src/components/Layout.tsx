import { Link } from "react-router-dom";
import { PropsWithChildren } from "react";
import { useAuth } from "../contexts/AuthContext";
import { FEEDBACK_FORM_URL } from "../constants/feedback";

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

        <nav className="topbar-actions" aria-label="Primary">
          <a
            className="secondary-button topbar-link-button"
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noreferrer"
          >
            Share feedback
          </a>
          {auth.session ? (
            <button className="ghost-button" onClick={auth.signOut} type="button">
              Sign out
            </button>
          ) : null}
        </nav>
      </header>

      <main className="page-container">{children}</main>
    </div>
  );
}
