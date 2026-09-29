import { Wand2 } from "lucide-react";
import { LoadingBlock } from "./LoadingBlock";
import { StatusBanner } from "./StatusBanner";
import { SetupReportList } from "./SetupReportList";
import { SpreadsheetSetup } from "../hooks/useSpreadsheetSetup";

interface SetupFreshPanelProps {
  setup: SpreadsheetSetup;
  onBack: () => void;
}

export function SetupFreshPanel({ setup, onBack }: SetupFreshPanelProps): JSX.Element {
  const { error, success, setupReport, templateCopyUrl, newSheetName, setNewSheetName, isCreating } = setup;

  return (
    <>
      <button className="setup-back-link" type="button" onClick={onBack}>
        ← Back to options
      </button>

      {error ? <StatusBanner variant="error" message={error} /> : null}
      {templateCopyUrl ? (
        <p className="text-sm muted" style={{ marginTop: "var(--space-2)" }}>
          To proceed, <a href={templateCopyUrl} target="_blank" rel="noopener noreferrer">open the template in Google Sheets and make a copy</a> into your Drive, then use "Connect a spreadsheet" to link it.
        </p>
      ) : null}
      {success ? <StatusBanner variant="success" message={success} /> : null}
      {setupReport ? <SetupReportList report={setupReport} variant="short" /> : null}

      <div className="card setup-card">
        <div className="setup-card-icon">
          <Wand2 size={24} aria-hidden />
          <span className="setup-card-title">Create my spreadsheet</span>
        </div>
        <p className="muted text-sm" style={{ marginBottom: "var(--space-4)" }}>
          QuickExpense will create a new Google Spreadsheet in your Drive with the correct structure, ready for you to start adding expenses.
        </p>
        <div className="input-group" style={{ marginBottom: "var(--space-4)" }}>
          <label className="input-label" htmlFor="new-sheet-name">Spreadsheet name</label>
          <input
            id="new-sheet-name"
            className="input"
            value={newSheetName}
            maxLength={100}
            disabled={isCreating}
            onChange={(e) => setNewSheetName(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={isCreating}
          onClick={() => void setup.onCreateSpreadsheet()}
        >
          {isCreating ? "Creating…" : "Create my spreadsheet"}
        </button>
      </div>
      {isCreating ? <LoadingBlock label="Creating your spreadsheet…" /> : null}
    </>
  );
}
