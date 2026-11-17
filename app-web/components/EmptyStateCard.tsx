import type { JSX } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, Receipt } from "lucide-react";
import { PermissionGatedAction, viewOnlyReason } from "./PermissionGatedAction";
import { useAuth } from "../contexts/AuthContext";

interface EmptyStateCardProps {
  variant: "no-sheet" | "no-data";
  /** Decorative placeholder chart under the no-data copy (Home only). */
  showGhostChart?: boolean;
}

export function EmptyStateCard({ variant, showGhostChart = true }: EmptyStateCardProps): JSX.Element {
  const { session } = useAuth();
  const isNoSheet = variant === "no-sheet";
  const isViewOnly = session?.guestAccessLevel === "view";
  return (
    <div className="home-empty-state">
      {isNoSheet
        ? <FileSpreadsheet size={48} className="home-empty-state-icon" aria-hidden />
        : <Receipt size={48} className="home-empty-state-icon" aria-hidden />}
      <h2 className="home-empty-state-title">
        {isNoSheet ? "Welcome to Quick Expense!" : "No expenses yet"}
      </h2>
      <p className="home-empty-state-body">
        {isNoSheet
          ? "Connect a Google Sheet to store your expenses. The sheet is yours: Quick Expense never keeps a copy."
          : "Add your first expense and this screen will show your spending summary."}
      </p>
      {!isNoSheet && showGhostChart && (
        <div className="home-ghost-chart" aria-hidden>
          {[40, 65, 30, 80, 50, 70].map((h, i) => (
            <div key={i} className="home-ghost-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
      )}
      {isNoSheet ? (
        <Link to="/setup" className="btn btn-primary home-empty-state-cta">Connect Sheet →</Link>
      ) : (
        <PermissionGatedAction
          allowed={!isViewOnly}
          reason={viewOnlyReason(session?.ownerEmail, "add expenses")}
          to="/add"
          className="btn btn-primary home-empty-state-cta"
        >
          + Add Expense
        </PermissionGatedAction>
      )}
    </div>
  );
}
