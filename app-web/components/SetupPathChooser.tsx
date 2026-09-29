import { FileSpreadsheet, Wand2 } from "lucide-react";
import { LoadingBlock } from "./LoadingBlock";
import { StatusBanner } from "./StatusBanner";

interface SetupPathChooserProps {
  isConfigLoading: boolean;
  configError: string | null;
  onChoose: (path: "fresh" | "existing") => void;
}

export function SetupPathChooser({ isConfigLoading, configError, onChoose }: SetupPathChooserProps): JSX.Element {
  return (
    <>
      {isConfigLoading ? <LoadingBlock label="Checking your current setup status…" /> : null}
      {!isConfigLoading && configError ? <StatusBanner variant="error" message={configError} /> : null}
      {!isConfigLoading && !configError ? (
        <p className="setup-path-intro">
          Connect Quick Expense to a Google Spreadsheet where your expenses will be stored.
        </p>
      ) : null}
      <div className="setup-path-grid">
        <div className="setup-path-card">
          <Wand2 size={28} className="setup-path-card-icon" aria-hidden />
          <span className="setup-path-card-title">Start fresh</span>
          <p className="setup-path-card-description">
            QuickExpense creates a new spreadsheet in your Google Drive, ready to use immediately.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={isConfigLoading}
            onClick={() => onChoose("fresh")}
          >
            Create my spreadsheet
          </button>
        </div>
        <div className="setup-path-card">
          <FileSpreadsheet size={28} className="setup-path-card-icon" aria-hidden />
          <span className="setup-path-card-title">Use existing sheet</span>
          <p className="setup-path-card-description">
            Connect a spreadsheet you already have. We'll check if its structure is compatible.
          </p>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={isConfigLoading}
            onClick={() => onChoose("existing")}
          >
            Connect a spreadsheet
          </button>
        </div>
      </div>
    </>
  );
}
