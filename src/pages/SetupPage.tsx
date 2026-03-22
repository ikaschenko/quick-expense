import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";

export function SetupPage(): JSX.Element {
  const { config, saveConfig, refreshConfig } = useConfig();
  const navigate = useNavigate();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

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
      const { accessToken } = await googleSheetsService.getPickerConfig();
      const result = await openSpreadsheetPicker(accessToken);
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
              Choose a spreadsheet from Google Drive or paste its link directly.
              Validation checks access rights and verifies the
              required <strong>Expenses</strong> sheet structure.
            </p>
          </div>
        </div>
        {error ? <StatusBanner variant="error" message={error} /> : null}
        {success ? <StatusBanner variant="success" message={success} /> : null}

        <div className="button-row" style={{ marginBottom: "1rem" }}>
          <button
            className="primary-button"
            disabled={busy}
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
            />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={busy} type="submit">
              Save
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              type="button"
              onClick={() => setSpreadsheetUrl("")}
            >
              Clear
            </button>
          </div>
        </form>
        {busy ? <LoadingBlock label={isPicking ? "Opening file picker…" : "Validating spreadsheet…"} /> : null}
      </section>
    </Layout>
  );
}
