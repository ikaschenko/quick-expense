import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";

type SetupOption = "existing" | "new";

export function SetupPage(): JSX.Element {
  const { config, saveConfig, refreshConfig } = useConfig();
  const navigate = useNavigate();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [activeOption, setActiveOption] = useState<SetupOption>("existing");

  useEffect(() => {
    setSpreadsheetUrl(config?.spreadsheetUrl ?? "");
  }, [config]);

  const saveSpreadsheet = async (url: string): Promise<void> => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      if (!url) {
        await googleSheetsService.clearConfig();
        refreshConfig();
        setSuccess("Spreadsheet removed. Setup is not complete.");
        return;
      }
      const nextConfig = await googleSheetsService.saveConfig(url);
      saveConfig(nextConfig);
      setSuccess("Spreadsheet is configured and validated.");
    } catch (saveError) {
      setError((saveError as Error).message);
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
        {error ? <StatusBanner variant="error" message={error} /> : null}
        {success ? <StatusBanner variant="success" message={success} /> : null}

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
