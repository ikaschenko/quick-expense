import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Info } from "lucide-react";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { AppError, HeaderDetails, SetupReport } from "../types/expense";
import { resolveSetupBannerState } from "../utils/setupStatus";

export function SetupPage(): JSX.Element {
  const { config, isConfigLoading, error: configError, saveConfig, refreshConfig } = useConfig();
  const navigate = useNavigate();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [headerDetails, setHeaderDetails] = useState<HeaderDetails | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [setupReport, setSetupReport] = useState<SetupReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [hasInvalidSetup, setHasInvalidSetup] = useState(false);

  useEffect(() => {
    setSpreadsheetUrl(config?.spreadsheetUrl ?? "");
  }, [config]);

  const saveSpreadsheet = async (url: string): Promise<void> => {
    setError(null);
    setHeaderDetails(null);
    setSuccess(null);
    setSetupReport(null);
    setIsSaving(true);

    try {
      if (!url) {
        await googleSheetsService.clearConfig();
        refreshConfig();
        setHasInvalidSetup(false);
        setSuccess("Spreadsheet removed. Setup is not complete.");
        return;
      }
      const { config: nextConfig, setupReport: report } = await googleSheetsService.saveConfig(url);
      saveConfig(nextConfig);
      setHasInvalidSetup(false);
      setSetupReport(report);
      setSuccess("Spreadsheet is configured and validated.");
      trackEvent("setup_saved");
    } catch (saveError) {
      setHasInvalidSetup(true);
      setError((saveError as Error).message);
      if (saveError instanceof AppError && saveError.headerDetails) {
        setHeaderDetails(saveError.headerDetails);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await saveSpreadsheet(spreadsheetUrl.trim());
  };

  const onPickFromDrive = async (): Promise<void> => {
    setError(null);
    setSuccess(null);
    setIsPicking(true);

    try {
      const { accessToken, apiKey, appId } = await googleSheetsService.getPickerConfig();
      const result = await openSpreadsheetPicker(accessToken, apiKey, appId);
      if (!result) return;

      setSpreadsheetUrl(result.spreadsheetUrl);
      await saveSpreadsheet(result.spreadsheetUrl);
    } catch (pickError) {
      setError((pickError as Error).message);
    } finally {
      setIsPicking(false);
    }
  };

  const busy = isSaving || isPicking;
  const setupBanner = resolveSetupBannerState({
    isConfigLoading,
    hasConfig: Boolean(config),
    hasInvalidSetup,
    hasLoadError: Boolean(configError),
  });

  return (
    <Layout title="Connect Spreadsheet">
      <div className="setup-progress">Step 1 of 1</div>

      <StatusBanner variant={setupBanner.variant} message={setupBanner.message} />
      {error ? <StatusBanner variant="error" message={error} /> : null}

      {headerDetails ? (
        <div className="header-mismatch">
          <table className="header-mismatch-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Expected</th>
                <th>Actual</th>
              </tr>
            </thead>
            <tbody>
              {headerDetails.expected.map((expected, i) => {
                const actual = headerDetails.actual[i] ?? "(missing)";
                const matches = expected === actual;
                return (
                  <tr key={i} className={matches ? "" : "header-mismatch-row"}>
                    <td>{i + 1}</td>
                    <td>{expected}</td>
                    <td>{actual}</td>
                  </tr>
                );
              })}
              {headerDetails.actual.slice(headerDetails.expected.length).map((extra, i) => (
                <tr key={headerDetails.expected.length + i} className="header-mismatch-row">
                  <td>{headerDetails.expected.length + i + 1}</td>
                  <td>(none)</td>
                  <td>{extra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {success ? <StatusBanner variant="success" message={success} /> : null}

      {setupReport ? (
        <ul className="setup-report">
          <li className="setup-report-item">
            {setupReport.tabAction === "created"
              ? "✓ Expenses tab created"
              : "✓ Expenses tab found"}
          </li>
          <li className="setup-report-item">
            {setupReport.headersAction === "created"
              ? "✓ Column headers created automatically"
              : setupReport.headersAction === "migrated"
                ? "✓ Columns migrated from legacy format"
                : "✓ Column headers valid"}
          </li>
        </ul>
      ) : null}

      <div className="card setup-card">
        <div className="setup-card-icon">
          <FileSpreadsheet size={24} aria-hidden />
          <span className="setup-card-title">Paste your Google Sheets URL</span>
        </div>

        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="input-group">
            <label className="input-label" htmlFor="spreadsheet-url">Spreadsheet link</label>
            <input
              id="spreadsheet-url"
              className="input"
              value={spreadsheetUrl}
              onChange={(event) => setSpreadsheetUrl(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {isSaving ? "Validating…" : "Connect Spreadsheet"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              type="button"
              onClick={() => setSpreadsheetUrl("")}
              style={{ width: "auto", flexShrink: 0 }}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="setup-divider">
          <span>or</span>
        </div>

        <button
          className="btn btn-secondary"
          disabled={busy}
          type="button"
          onClick={() => void onPickFromDrive()}
        >
          {isPicking ? "Opening picker…" : "Browse Google Drive"}
        </button>
      </div>

      <div className="setup-trust">
        <Info size={16} aria-hidden />
        <span>Your data stays in your spreadsheet. We never store your expenses.</span>
      </div>

      {busy ? <LoadingBlock label={isPicking ? "Opening file picker…" : "Validating spreadsheet…"} /> : null}
    </Layout>
  );
}
