import { SetupReport } from "../types/expense";

interface SetupReportListProps {
  report: SetupReport;
  /** "full" adds the legacy-migration wording used outside the fresh-creation path. */
  variant?: "short" | "full";
}

function headersLabel(report: SetupReport, variant: "short" | "full"): string {
  if (report.headersAction === "created") {
    return variant === "short" ? "✓ Column headers created" : "✓ Column headers created automatically";
  }
  if (variant === "full" && report.headersAction === "migrated") {
    return "✓ Columns migrated from legacy format";
  }
  return "✓ Column headers valid";
}

export function SetupReportList({ report, variant = "full" }: SetupReportListProps): JSX.Element {
  return (
    <ul className="setup-report">
      <li className="setup-report-item">
        {report.tabAction === "created" ? "✓ Expenses tab created" : "✓ Expenses tab found"}
      </li>
      <li className="setup-report-item">{headersLabel(report, variant)}</li>
    </ul>
  );
}
