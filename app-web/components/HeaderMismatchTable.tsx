import { ColumnMappingEditor } from "./ColumnMappingEditor";
import { HeaderDetails } from "../types/expense";
import { deriveHeaderRowDetails } from "../utils/spreadsheet";

const STATUS_BADGES: Record<string, string> = {
  match: "✓ Match",
  mismatch: "✗ Mismatch",
  missing: "− Missing",
  extra: "+ Extra",
};

interface HeaderMismatchTableProps {
  headerDetails: HeaderDetails;
  showMappingEditor: boolean;
  onShowMappingEditor: () => void;
  onMappingSaved: () => void;
  onMappingCancel: () => void;
}

export function HeaderMismatchTable({
  headerDetails,
  showMappingEditor,
  onShowMappingEditor,
  onMappingSaved,
  onMappingCancel,
}: HeaderMismatchTableProps): JSX.Element {
  return (
    <div className="header-mismatch">
      <p className="header-mismatch-intro">
        Your sheet's column structure doesn't match what QuickExpense expects. Here's a comparison:
      </p>
      <table className="header-mismatch-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Expected</th>
            <th>Your sheet</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {deriveHeaderRowDetails(headerDetails).map((row) => (
            <tr key={row.index} className={row.status !== "match" ? "header-mismatch-row" : ""} data-status={row.status}>
              <td>{row.index + 1}</td>
              <td>{row.expected}</td>
              <td>{row.actual}</td>
              <td className="header-mismatch-status">
                <span className={`header-mismatch-badge header-mismatch-badge--${row.status}`}>
                  {STATUS_BADGES[row.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showMappingEditor ? (
        <button
          className="btn btn-secondary"
          type="button"
          style={{ marginTop: "var(--space-3)" }}
          onClick={onShowMappingEditor}
        >
          Map columns →
        </button>
      ) : null}
      {showMappingEditor && headerDetails.detectedColumns.length > 0 ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <ColumnMappingEditor
            detectedColumns={headerDetails.detectedColumns}
            onSaved={onMappingSaved}
            onCancel={onMappingCancel}
          />
        </div>
      ) : null}
    </div>
  );
}
