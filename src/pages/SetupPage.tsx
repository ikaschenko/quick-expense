import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { AppError, HeaderDetails, SetupReport } from "../types/expense";
import { resolveSetupBannerState } from "../utils/setupStatus";

type SetupOption = "existing" | "new";

export function SetupPage(): JSX.Element {
  const { config, isConfigLoading, saveConfig, refreshConfig } = useConfig();
  const navigate = useNavigate();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [headerDetails, setHeaderDetails] = useState<HeaderDetails | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [setupReport, setSetupReport] = useState<SetupReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [hasInvalidSetup, setHasInvalidSetup] = useState(false);
  const [activeOption, setActiveOption] = useState<SetupOption>("existing");

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
  const isExisting = activeOption === "existing";
  const setupBanner = resolveSetupBannerState({
    isConfigLoading,
    hasConfig: Boolean(config),
    hasInvalidSetup,
  });

  return (
    <Layout>
      <section className="card">
        <div className="page-header">
          <div className="page-header-top">
            <h1>Setup</h1>
            <button className="secondary-button" onClick={() => navigate(-1)} type="button">
              Back
            </button>
          </div>
          <div>
            <p className="muted">
              Connect a Google Spreadsheet to store your expenses.
              Pick an option below to get started.
            </p>
          </div>
        </div>
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

        <div className="setup-options">
          {/* Option 1: Use Existing File */}
          <div
            className={`setup-option-panel${isExisting ? " setup-option-active" : " setup-option-inactive"}`}
            onClick={() => !busy && setActiveOption("existing")}
          >
            <label className="setup-option-header">
              <input
                type="radio"
                name="setup-option"
                checked={isExisting}
                onChange={() => setActiveOption("existing")}
                disabled={busy}
              />
              <span className="setup-option-title">Use Existing File</span>
            </label>

            <div className="setup-option-body">
              <p className="muted small">
                Choose a spreadsheet from Google Drive or paste its link directly.
                Validation checks access rights and verifies the
                required <strong>Expenses</strong> sheet structure.
              </p>

              <div className="button-row" style={{ marginBottom: "1rem" }}>
                <button
                  className="primary-button"
                  disabled={busy || !isExisting}
                  type="button"
                  onClick={() => void onPickFromDrive()}
                >
                  Choose from Google Drive
                </button>
              </div>

              <div className="setup-divider">
                <span className="muted">or paste a link</span>
              </div>

              <form className="form-layout emphasized-field-labels" onSubmit={(event) => void onSubmit(event)}>
                <label className="field">
                  <span>Google Spreadsheet link</span>
                  <input
                    value={spreadsheetUrl}
                    onChange={(event) => setSpreadsheetUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    disabled={!isExisting}
                  />
                </label>
                <div className="button-row">
                  <button className="primary-button" disabled={busy || !isExisting} type="submit">
                    Save
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy || !isExisting}
                    type="button"
                    onClick={() => setSpreadsheetUrl("")}
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Option 2: Create New File */}
          <div
            className={`setup-option-panel${!isExisting ? " setup-option-active" : " setup-option-inactive"}`}
            onClick={() => !busy && setActiveOption("new")}
          >
            <label className="setup-option-header">
              <input
                type="radio"
                name="setup-option"
                checked={!isExisting}
                onChange={() => setActiveOption("new")}
                disabled={busy}
              />
              <span className="setup-option-title">Create New File</span>
            </label>

            <div className="setup-option-body">
              <ol className="setup-instructions">
                <li>
                  Open{" "}
                  <a
                    href="https://sheets.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Sheets
                  </a>{" "}
                  and create a new blank spreadsheet.
                </li>
                <li>Place the file wherever you like in your Google Drive.</li>
                <li>Copy the spreadsheet link from your browser's address bar.</li>
                <li>
                  Switch to <strong>Use Existing File</strong> above and paste the
                  link there.
                </li>
              </ol>
            </div>
          </div>
        </div>

        {busy ? <LoadingBlock label={isPicking ? "Opening file picker…" : "Validating spreadsheet…"} /> : null}
      </section>
    </Layout>
  );
}
