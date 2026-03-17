import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { googleSheetsService } from "../services/googleSheets";

export function SetupPage(): JSX.Element {
  const { config, saveConfig } = useConfig();
  const navigate = useNavigate();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSpreadsheetUrl(config?.spreadsheetUrl ?? "");
  }, [config]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    setIsSaving(true);

    try {
      const nextConfig = await googleSheetsService.saveConfig(spreadsheetUrl.trim());
      saveConfig(nextConfig);
      setSuccess("Spreadsheet is configured and validated.");
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

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
              Save the full Google Spreadsheet link. Validation checks access rights and
              verifies the required <strong>Expenses</strong> sheet structure.
            </p>
          </div>
        </div>
        {error ? <StatusBanner variant="error" message={error} /> : null}
        {success ? <StatusBanner variant="success" message={success} /> : null}
        <form className="form-layout emphasized-field-labels" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Google Spreadsheet link</span>
            <input
              value={spreadsheetUrl}
              onChange={(event) => setSpreadsheetUrl(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              required
            />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={isSaving} type="submit">
              Save
            </button>
          </div>
        </form>
        {success ? (
          <div className="button-row">
            <button className="primary-button" onClick={() => navigate("/home")} type="button">
              Go to main menu
            </button>
            <button className="secondary-button" onClick={() => navigate("/add")} type="button">
              Open Add
            </button>
            <button className="secondary-button" onClick={() => navigate("/search")} type="button">
              Open Search
            </button>
          </div>
        ) : null}
        {isSaving ? <LoadingBlock label="Validating spreadsheet…" /> : null}
      </section>
    </Layout>
  );
}
