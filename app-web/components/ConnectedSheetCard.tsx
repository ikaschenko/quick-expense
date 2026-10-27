import { useState, type JSX } from "react";
import { FileSpreadsheet, Link2Off, Pencil } from "lucide-react";
import { StatusBanner } from "./StatusBanner";
import { SpreadsheetFileInfo } from "./SpreadsheetFileInfo";
import { useConfig } from "../contexts/ConfigContext";
import { SpreadsheetConfig } from "../types/expense";
import { configModeValueLabel, configModeTooltip } from "../utils/setupColumns";

interface ConnectedSheetCardProps {
  config: SpreadsheetConfig;
  onChangeSheet: () => void;
  onFixConfig: () => void;
}

export function ConnectedSheetCard({ config, onChangeSheet, onFixConfig }: ConnectedSheetCardProps): JSX.Element {
  const { clearConfig, fileName, isFileNameLoading } = useConfig();
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const handleUnlink = async (): Promise<void> => {
    setIsUnlinking(true);
    setUnlinkError(null);
    try {
      await clearConfig();
    } catch (err) {
      setUnlinkError((err as Error).message);
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <>
      <div className="home-status-card connected">
        <div className="home-status-header">
          <FileSpreadsheet size={20} className="home-status-icon" style={{ color: "var(--color-success)" }} aria-hidden />
          <div className="home-status-label">Connected</div>
          {!config.isGuest ? (
            <div className="home-status-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onChangeSheet}>
                <Pencil size={14} aria-hidden />
                Change
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => void handleUnlink()}
                disabled={isUnlinking}
                aria-busy={isUnlinking}
              >
                <Link2Off size={14} aria-hidden />
                {isUnlinking ? "Unlinking…" : "Unlink"}
              </button>
            </div>
          ) : null}
        </div>
        <div className="home-status-meta">
          <div className="home-status-meta-row">
            <span className="home-status-meta-label">File:</span>{" "}
            <SpreadsheetFileInfo spreadsheetUrl={config.spreadsheetUrl} fileName={fileName} isLoading={isFileNameLoading} />
          </div>
          <div className="home-status-meta-row">
            <span className="home-status-meta-label">Configuration:</span>{" "}
            <span title={configModeTooltip(config.configMode)}>{configModeValueLabel(config.configMode)}</span>
            {config.configMode === "config-invalid" ? (
              <>
                {" "}
                <span className="config-mode-fix-hint">
                  Your Config sheet was found but could not be read.{" "}
                  <button type="button" className="btn-inline" onClick={onFixConfig}>
                    Fix it &rarr;
                  </button>
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {unlinkError ? <StatusBanner variant="error" message={unlinkError} /> : null}
    </>
  );
}
