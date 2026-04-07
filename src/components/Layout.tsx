import { Link, useLocation, useNavigate } from "react-router-dom";
import { PropsWithChildren, useState, useRef, useEffect } from "react";
import { ChevronLeft, House, Plus, Clock, Search, LogOut, MessageSquareShare } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { FEEDBACK_FORM_URL } from "../constants/feedback";

interface LayoutProps extends PropsWithChildren {
  title?: string;
}

export function Layout({ children, title }: LayoutProps): JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const isHome = location.pathname === "/home";
  const avatarLetter = auth.session?.email?.charAt(0) ?? "?";

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
                    Privacy Policy
                  </a>
                  <a
                    href="/terms-of-service.html"
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%", padding: "var(--space-2) var(--space-3)", border: "none", background: "transparent", fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)", cursor: "pointer", textDecoration: "none" }}
                  >
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
