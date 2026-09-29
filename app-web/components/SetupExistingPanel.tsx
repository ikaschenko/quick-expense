import { FileSpreadsheet } from "lucide-react";
import { LoadingBlock } from "./LoadingBlock";
import { StatusBanner } from "./StatusBanner";
import { SetupReportList } from "./SetupReportList";
import { SetupStructureGuide } from "./SetupStructureGuide";
import { HeaderMismatchTable } from "./HeaderMismatchTable";
import { SpreadsheetSetup } from "../hooks/useSpreadsheetSetup";

interface SetupExistingPanelProps {
  setup: SpreadsheetSetup;
  onBack: () => void;
}

export function SetupExistingPanel({ setup, onBack }: SetupExistingPanelProps): JSX.Element {
  const { error, success, setupReport, headerDetails, busy, isSaving, isPicking, showMappingEditor } = setup;

  return (
    <>
      <button className="setup-back-link" type="button" onClick={onBack}>
        ← Back to options
      </button>

      {success ? <StatusBanner variant="success" message={success} /> : null}
      {setupReport ? <SetupReportList report={setupReport} /> : null}

      <div className="card setup-card">
        <div className="setup-card-icon">
          <FileSpreadsheet size={24} aria-hidden />
          <span className="setup-card-title">
            Google Sheets URL
            {(error || headerDetails) ? (
              <span className="setup-card-title-warning" aria-label="Column structure issue detected">⚠</span>
            ) : null}
          </span>
        </div>

        <SetupStructureGuide />

        <button
          className="btn btn-primary"
          disabled={busy}
          type="button"
          onClick={() => void setup.onPickFromDrive()}
        >
          {isPicking ? "Opening picker…" : "Select from Google Drive"}
        </button>

      </div>

      {busy ? <LoadingBlock label={isSaving ? "Checking compatibility…" : "Opening file picker…"} /> : null}

      {error ? <StatusBanner variant="error" message={error} /> : null}

      {headerDetails ? (
        <HeaderMismatchTable
          headerDetails={headerDetails}
          showMappingEditor={showMappingEditor}
          onShowMappingEditor={() => setup.setShowMappingEditor(true)}
          onMappingSaved={() => {
            setup.setShowMappingEditor(false);
            void setup.resaveCurrentSpreadsheet();
          }}
          onMappingCancel={() => setup.setShowMappingEditor(false)}
        />
      ) : null}
    </>
  );
}
