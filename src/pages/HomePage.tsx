import { Link } from "react-router-dom";
import { Plus, Clock, Search, AlertTriangle, Settings } from "lucide-react";
import { Layout } from "../components/Layout";
import { useConfig } from "../contexts/ConfigContext";
import { useAuth } from "../contexts/AuthContext";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFirstName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const name = local.split(/[._-]/)[0] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function HomePage(): JSX.Element {
  const { config } = useConfig();
  const { session } = useAuth();
  const firstName = session?.email ? getFirstName(session.email) : "";

  return (
    <Layout title="Quick Expense">
      <p className="home-greeting">
        {getGreeting()}, {firstName} 👋
      </p>

      {config ? (
        <div className="home-status-card connected">
          <Settings size={20} className="home-status-icon" aria-hidden />
          <div className="home-status-content">
            <div className="home-status-label">Connected</div>
            <div className="home-status-detail">{config.spreadsheetUrl}</div>
          </div>
          <Link to="/setup" className="home-status-action">Change</Link>
        </div>
      ) : (
        <div className="home-status-card disconnected">
          <AlertTriangle size={20} className="home-status-icon" aria-hidden />
          <div className="home-status-content">
            <div className="home-status-label">No spreadsheet yet</div>
            <div className="home-status-detail">Connect one to start tracking</div>
          </div>
          <Link to="/setup" className="home-status-action">Setup now →</Link>
        </div>
      )}

      <div className="home-cta">
        {config ? (
          <Link to="/add" className="btn btn-primary">
            <Plus size={20} aria-hidden />
            Add Expense
          </Link>
        ) : (
          <span className="btn btn-primary" style={{ opacity: 0.5, cursor: "not-allowed" }}>
            <Plus size={20} aria-hidden />
            Add Expense
          </span>
        )}
      </div>

      <div className="home-secondary-row">
        {config ? (
          <Link to="/tail" className="card card-hover home-secondary-card">
            <Clock size={24} className="home-secondary-card-icon" aria-hidden />
            <span className="home-secondary-card-label">Last 20</span>
          </Link>
        ) : (
          <div className="card home-secondary-card home-secondary-card-disabled">
            <Clock size={24} className="home-secondary-card-icon" aria-hidden />
            <span className="home-secondary-card-label">Last 20</span>
          </div>
        )}
        {config ? (
          <Link to="/search" className="card card-hover home-secondary-card">
            <Search size={24} className="home-secondary-card-icon" aria-hidden />
            <span className="home-secondary-card-label">Find expense</span>
          </Link>
        ) : (
          <div className="card home-secondary-card home-secondary-card-disabled">
            <Search size={24} className="home-secondary-card-icon" aria-hidden />
            <span className="home-secondary-card-label">Find expense</span>
          </div>
        )}
      </div>
    </Layout>
  );
}
