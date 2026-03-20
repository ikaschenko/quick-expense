import { Link } from "react-router-dom";
import { PropsWithChildren } from "react";
import { MessageSquareShare, LogOut } from "lucide-react";
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
            title="Share feedback"
          >
            <MessageSquareShare size={16} aria-hidden />
            <span className="topbar-btn-label">Share feedback</span>
          </a>
          {auth.session ? (
            <button className="ghost-button" onClick={auth.signOut} type="button" title="Sign out">
              <LogOut size={16} aria-hidden />
              <span className="topbar-btn-label">Sign out</span>
            </button>
          ) : null}
        </nav>
      </header>

      <main className="page-container">{children}</main>

      <footer className="site-footer">
        <a href="/privacy-policy.html" className="footer-link">Privacy Policy</a>
        <span className="footer-sep" aria-hidden>·</span>
        <a href="/terms-of-service.html" className="footer-link">Terms of Service</a>
      </footer>
    </div>
  );
}
