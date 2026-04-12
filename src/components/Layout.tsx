import { Link, useLocation, useNavigate } from "react-router-dom";
import { PropsWithChildren, useState, useRef, useEffect } from "react";
import { ChevronLeft, House, Plus, Clock, Search, LogOut, MessageSquareShare, X, Shield, FileText } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";
import { FEEDBACK_FORM_URL } from "../constants/feedback";

interface LayoutProps extends PropsWithChildren {
  title?: string;
}

export function Layout({ children, title }: LayoutProps): JSX.Element {
  const auth = useAuth();
  const config = useConfig();
  const dataset = useDataset();
  const location = useLocation();
  const navigate = useNavigate();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const isHome = location.pathname === "/home";
  const avatarLetter = auth.session?.email?.charAt(0) ?? "?";
  
  // Show banner when auth, config, or dataset has an error
  const activeError = auth.error || config.error || dataset.error;
  
  useEffect(() => {
    if (activeError) {
      console.log("[Layout] Error detected:", activeError);
      setShowErrorBanner(true);
      const timer = setTimeout(() => setShowErrorBanner(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [activeError]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [avatarMenuOpen]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          {!isHome ? (
            <button
              className="topbar-back"
              onClick={() => navigate(-1)}
              type="button"
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
          ) : null}
        </div>

        <span className="topbar-title">{title ?? "Quick Expense"}</span>

        <div className="topbar-right" ref={avatarRef}>
          {auth.session ? (
            <>
              <button
                className="topbar-avatar"
                onClick={() => setAvatarMenuOpen((prev) => !prev)}
                type="button"
                aria-label="Account menu"
              >
                {avatarLetter}
              </button>
              {avatarMenuOpen ? (
                <div className="topbar-avatar-menu">
                  <a
                    href={FEEDBACK_FORM_URL}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%", padding: "var(--space-2) var(--space-3)", border: "none", background: "transparent", fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)", cursor: "pointer", textDecoration: "none" }}
                  >
                    <MessageSquareShare size={14} aria-hidden />
                    Feedback
                  </a>
                  <a
                    href="/privacy-policy.html"
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%", padding: "var(--space-2) var(--space-3)", border: "none", background: "transparent", fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)", cursor: "pointer", textDecoration: "none" }}
                  >
                    <Shield size={14} aria-hidden />
                    Privacy Policy
                  </a>
                  <a
                    href="/terms-of-service.html"
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%", padding: "var(--space-2) var(--space-3)", border: "none", background: "transparent", fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)", cursor: "pointer", textDecoration: "none" }}
                  >
                    <FileText size={14} aria-hidden />
                    Terms of Service
                  </a>
                  <button
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      auth.signOut();
                    }}
                    type="button"
                  >
                    <LogOut size={14} aria-hidden />
                    Sign out
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <a
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noreferrer"
              className="topbar-back"
              aria-label="Share feedback"
              title="Share feedback"
            >
              <MessageSquareShare size={18} />
            </a>
          )}
        </div>
      </header>

      <main className="page-content">
        {showErrorBanner && activeError && (
          <div
            style={{
              padding: "var(--space-3)",
              marginBottom: "var(--space-3)",
              backgroundColor: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#7f1d1d",
              fontSize: "var(--font-size-sm)",
            }}
          >
            <span>{activeError}</span>
            <button
              onClick={() => {
                setShowErrorBanner(false);
                auth.clearError?.();
                config.clearError?.();
                dataset.clearError?.();
              }}
              type="button"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                color: "inherit",
              }}
              aria-label="Close error message"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="page-content-inner page-animate">{children}</div>
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <Link
          to="/home"
          className={`bottom-nav-item${location.pathname === "/home" ? " active" : ""}`}
          aria-label="Home"
        >
          <House size={22} />
          <span>Home</span>
        </Link>
        <Link
          to="/tail"
          className={`bottom-nav-item${location.pathname === "/tail" ? " active" : ""}`}
          aria-label="History"
        >
          <Clock size={22} />
          <span>History</span>
        </Link>
        <Link to="/add" className="bottom-nav-add" aria-label="Add expense">
          <Plus size={24} />
        </Link>
        <Link
          to="/search"
          className={`bottom-nav-item${location.pathname === "/search" ? " active" : ""}`}
          aria-label="Search"
        >
          <Search size={22} />
          <span>Search</span>
        </Link>
        <Link
          to="/setup"
          className={`bottom-nav-item${location.pathname === "/setup" ? " active" : ""}`}
          aria-label="Setup"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          <span>Setup</span>
        </Link>
      </nav>
    </div>
  );
}
