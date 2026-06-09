import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Clock, Search, AlertTriangle, Settings, FileSpreadsheet, Receipt } from "lucide-react";
import { Layout } from "../components/Layout";
import { SpreadsheetFileInfo } from "../components/SpreadsheetFileInfo";
import { useConfig } from "../contexts/ConfigContext";
import { useAuth } from "../contexts/AuthContext";
import { googleSheetsService } from "../services/googleSheets";

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

interface EmptyStateProps {
  variant: "no-sheet" | "no-data";
}

function HomeEmptyState({ variant }: EmptyStateProps): JSX.Element {
  const isNoSheet = variant === "no-sheet";
  return (
    <div className="home-empty-state">
      {isNoSheet
        ? <FileSpreadsheet size={48} className="home-empty-state-icon" aria-hidden />
        : <Receipt size={48} className="home-empty-state-icon" aria-hidden />}
      <h2 className="home-empty-state-title">
        {isNoSheet ? "Almost ready!" : "No expenses yet"}
      </h2>
      <p className="home-empty-state-body">
        {isNoSheet
          ? "Connect a Google Sheet to start tracking expenses."
          : "Add your first one — it takes under 30 seconds — and this screen will show your spending summary."}
      </p>
      {!isNoSheet && (
        <div className="home-ghost-chart" aria-hidden>
          {[40, 65, 30, 80, 50, 70].map((h, i) => (
            <div key={i} className="home-ghost-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
      )}
      <Link to={isNoSheet ? "/setup" : "/add"} className="btn btn-primary home-empty-state-cta">
        {isNoSheet ? "Connect Sheet →" : "+ Add Expense"}
      </Link>
    </div>
  );
}

export function HomePage(): JSX.Element {
  const { config, isConfigLoading, fileName, isFileNameLoading } = useConfig();
  const { session } = useAuth();
  const firstName = session?.givenName ?? (session?.email ? getFirstName(session.email) : "");
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [isRowCountLoading, setIsRowCountLoading] = useState(false);

  useEffect(() => {
    if (!config || isConfigLoading) return;
    setIsRowCountLoading(true);
    googleSheetsService
      .getExpenseRowCount()
      .then(({ rowCount: count }) => setRowCount(count))
      .catch(() => setRowCount(null))
      .finally(() => setIsRowCountLoading(false));
  }, [config?.spreadsheetUrl, isConfigLoading]);

  const isLoading = isConfigLoading || isRowCountLoading;
  const showEmptySheet = !isLoading && !config;
  const showEmptyData = !isLoading && config && rowCount === 0;
  const showDashboard = !isLoading && config && (rowCount === null || rowCount > 0);

  return (
    <Layout title="Quick Expense">
      <div className="home-wrapper">
        <p className="home-greeting">
          {getGreeting()}, {firstName} 👋
        </p>

        {isLoading ? (
          <div className="home-status-card loading">
            <div className="spinner spinner-sm home-status-icon" aria-hidden />
            <div className="home-status-content">
              <div className="home-status-label">Checking configuration…</div>
            </div>
          </div>
        ) : showEmptySheet ? (
          <HomeEmptyState variant="no-sheet" />
        ) : showEmptyData ? (
          <HomeEmptyState variant="no-data" />
        ) : showDashboard ? (
          <>
            <div className="home-status-card connected">
              <Settings size={20} className="home-status-icon" aria-hidden />
              <div className="home-status-content">
                <div className="home-status-label">Connected</div>
                <div className="home-status-detail">
                  <SpreadsheetFileInfo spreadsheetUrl={config!.spreadsheetUrl} fileName={fileName} isLoading={isFileNameLoading} />
                </div>
              </div>
              <Link to="/setup" className="home-status-action">Change</Link>
            </div>

            <div className="home-cta">
              <Link to="/add" className="btn btn-primary">
                <Plus size={20} aria-hidden />
                Add Expense
              </Link>
            </div>

            <div className="home-secondary-row">
              <Link to="/tail" className="card card-hover home-secondary-card">
                <Clock size={24} className="home-secondary-card-icon" aria-hidden />
                <span className="home-secondary-card-label">History (last 20)</span>
              </Link>
              <Link to="/search" className="card card-hover home-secondary-card">
                <Search size={24} className="home-secondary-card-icon" aria-hidden />
                <span className="home-secondary-card-label">Search</span>
              </Link>
            </div>
          </>
        ) : null}

        <a
          href="https://buymeacoffee.com/qexpensesux"
          target="_blank"
          rel="noreferrer"
          className="home-support-link"
        >
          <img src="/bmc-logo.svg" alt="Buy Me a Coffee" height="22" aria-hidden style={{ verticalAlign: "middle", marginRight: "6px" }} />
          Like Quick Expense? Support the project
        </a>
      </div>
    </Layout>
  );
}

