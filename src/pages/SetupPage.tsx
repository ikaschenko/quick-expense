import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Wand2, ChevronDown, ChevronUp, X, Plus, Pencil, Trash2, Check, TableProperties } from "lucide-react";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { ColumnMappingEditor } from "../components/ColumnMappingEditor";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { AppError, ColumnMapping, ConfigMode, CurrencyDictionary, HeaderDetails, SetupReport } from "../types/expense";
import { deriveHeaderRowDetails, validateColumnName } from "../utils/spreadsheet";
import { REQUIRED_QE_FIELDS } from "../constants/expenses";

type ColumnType = "mandatory-field" | "mandatory-currency" | "optional-currency" | "custom-column";

function configModeBadgeLabel(mode: ConfigMode): string {
  switch (mode) {
    case "config-driven": return "Config detected";
    case "default": return "Default rules";
    case "config-invalid": return "Config invalid \u2014 using defaults";
  }
}

function configModeTooltip(mode: ConfigMode): string | undefined {
  switch (mode) {
    case "config-driven": return "QuickExpense is using your Config sheet settings.";
    case "default": return "No Config sheet found. Standard column rules apply.";
    case "config-invalid": return undefined;
  }
}

interface ColumnInfo {
  name: string;
  type: ColumnType;
}

function classifyColumns(currencies: string[], customColumns: string[]): ColumnInfo[] {
  const result: ColumnInfo[] = [];
  result.push({ name: "Date", type: "mandatory-field" });
  for (const code of currencies) {
    result.push({ name: code, type: "optional-currency" });
  }
  result.push({ name: "USD", type: "mandatory-currency" });
  result.push({ name: "Category", type: "mandatory-field" });
  result.push({ name: "Spent By", type: "mandatory-field" });
  result.push({ name: "Comment", type: "mandatory-field" });
  for (const col of customColumns) {
    result.push({ name: col, type: "custom-column" });
  }
  return result;
}

function typeLabel(type: ColumnType): string {
  switch (type) {
    case "mandatory-field": return "Mandatory field";
    case "mandatory-currency": return "Mandatory currency";
    case "optional-currency": return "Optional currency";
    case "custom-column": return "Custom column";
  }
}

const MAX_CUSTOM_COLUMNS = 10;

type SetupPath = "choose" | "fresh" | "existing" | "configured";

export function SetupPage(): JSX.Element {
  const { config, isConfigLoading, error: configError, saveConfig, refreshConfig, updateStructure } = useConfig();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [headerDetails, setHeaderDetails] = useState<HeaderDetails | null>(null);
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [setupReport, setSetupReport] = useState<SetupReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [setupPath, setSetupPath] = useState<SetupPath>(() => config ? "configured" : "choose");
  const [isCreating, setIsCreating] = useState(false);
  const [newSheetName, setNewSheetName] = useState("Quick Expense — My Expenses");
  const [structureGuideOpen, setStructureGuideOpen] = useState(false);
  const navigate = useNavigate();

  // Structure management state
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Add currency state
  const [isAddingCurrency, setIsAddingCurrency] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState("");
  const [currencyDictionary, setCurrencyDictionary] = useState<CurrencyDictionary | null>(null);

  // Add custom column state
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // Rename state
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Remove confirmation
  const [confirmRemoveName, setConfirmRemoveName] = useState<string | null>(null);

  // Field-level error for inline forms
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Column mapping state (configured path)
  const [mappingData, setMappingData] = useState<{
    mapping: ColumnMapping | null;
    mode: ConfigMode;
    detectedColumns: string[];
  } | null>(null);
  const [mappingLoadError, setMappingLoadError] = useState<string | null>(null);
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);
  const [mappingSectionOpen, setMappingSectionOpen] = useState(false);
  const [mappingSuccess, setMappingSuccess] = useState<string | null>(null);

  useEffect(() => {
    setSpreadsheetUrl(config?.spreadsheetUrl ?? "");
  }, [config]);

  // Load currency dictionary for autocomplete
  useEffect(() => {
    if (config?.spreadsheetId) {
      void googleSheetsService.getAvailableCurrencies().then(setCurrencyDictionary).catch(() => undefined);
    }
  }, [config?.spreadsheetId]);

  // Fetch column mapping when viewing the configured path
  useEffect(() => {
    if (setupPath !== "configured" || !config?.spreadsheetId) return;
    setMappingLoadError(null);
    setMappingData(null);
    void googleSheetsService
      .getColumnMapping()
      .then(setMappingData)
      .catch((err) => setMappingLoadError((err as Error).message));
  }, [setupPath, config?.spreadsheetId]);

  // Sync setupPath when config loads or clears
  useEffect(() => {
    if (isConfigLoading) return;
    if (config) {
      setSetupPath("configured");
    } else {
      setSetupPath((prev) => (prev === "configured" ? "choose" : prev));
    }
  }, [config, isConfigLoading]);

  const columns = useMemo(
    () => classifyColumns(config?.currencies ?? [], config?.customColumns ?? []),
    [config?.currencies, config?.customColumns],
  );

  const currencies = config?.currencies ?? [];
  const customColumns = config?.customColumns ?? [];
  const maxOptionalCurrencies = currencyDictionary?.maxOptional ?? 0;

  function clearActionBanners() {
    setActionError(null);
    setActionSuccess(null);
    setFieldError(null);
  }

  // ─── Add Currency ──────────────────────────────────────────────────────────

  const startAddingCurrency = () => {
    clearActionBanners();
    setIsAddingColumn(false);
    setRenamingColumn(null);
    setConfirmRemoveName(null);
    setNewCurrencyCode("");
    setIsAddingCurrency(true);
  };

  const cancelAddingCurrency = () => {
    setIsAddingCurrency(false);
    setNewCurrencyCode("");
    setFieldError(null);
  };

  const submitAddCurrency = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code) { setFieldError("Currency code cannot be empty."); return; }
    if (code.length > 10) { setFieldError("Currency code must be 10 characters or less."); return; }
    if (code.toLowerCase() === "usd") { setFieldError("USD is already a mandatory column."); return; }
    if (currencies.some((c) => c.toLowerCase() === code.toLowerCase())) {
      setFieldError(`Currency "${code}" already exists.`);
      return;
    }

    setActionBusy(true);
    setFieldError(null);
    try {
      const result = await googleSheetsService.addSheetCurrency(code);
      updateStructure(result.currencies, result.customColumns);
      setIsAddingCurrency(false);
      setNewCurrencyCode("");
      setActionSuccess(`Currency column "${code}" added.`);
      trackEvent("currency_added", { code });
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  // ─── Add Custom Column ─────────────────────────────────────────────────────

  const startAddingColumn = () => {
    clearActionBanners();
    setIsAddingCurrency(false);
    setRenamingColumn(null);
    setConfirmRemoveName(null);
    setNewColumnName("");
    setIsAddingColumn(true);
  };

  const cancelAddingColumn = () => {
    setIsAddingColumn(false);
    setNewColumnName("");
    setFieldError(null);
  };

  const submitAddColumn = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const name = newColumnName.trim();
    const err = validateColumnName(name, customColumns);
    if (err) { setFieldError(err); return; }

    setActionBusy(true);
    setFieldError(null);
    try {
      const result = await googleSheetsService.addSheetColumn(name);
      updateStructure(result.currencies, result.customColumns);
      setIsAddingColumn(false);
      setNewColumnName("");
      setActionSuccess(`Column "${name}" added.`);
      trackEvent("column_added", { name });
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  // ─── Rename ─────────────────────────────────────────────────────────────────

  const startRenaming = (colName: string) => {
    clearActionBanners();
    setIsAddingCurrency(false);
    setIsAddingColumn(false);
    setConfirmRemoveName(null);
    setRenamingColumn(colName);
    setRenameValue(colName);
  };

  const cancelRenaming = () => {
    setRenamingColumn(null);
    setRenameValue("");
    setFieldError(null);
  };

  const submitRename = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!renamingColumn) return;
    const newName = renameValue.trim();
    const allNames = [...currencies, ...customColumns];
    const err = validateColumnName(newName, allNames, renamingColumn);
    if (err) { setFieldError(err); return; }

    setActionBusy(true);
    setFieldError(null);
    try {
      const result = await googleSheetsService.renameSheetColumn(renamingColumn, newName);
      updateStructure(result.currencies, result.customColumns);
      setRenamingColumn(null);
      setRenameValue("");
      setActionSuccess(`Column renamed to "${newName}".`);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  // ─── Reorder ────────────────────────────────────────────────────────────────

  const moveCurrency = async (index: number, direction: -1 | 1): Promise<void> => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= currencies.length) return;
    clearActionBanners();
    const next = [...currencies];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setActionBusy(true);
    try {
      const result = await googleSheetsService.reorderSheetCurrencies(next);
      updateStructure(result.currencies, result.customColumns);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const moveCustomColumn = async (index: number, direction: -1 | 1): Promise<void> => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= customColumns.length) return;
    clearActionBanners();
    const next = [...customColumns];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setActionBusy(true);
    try {
      const result = await googleSheetsService.reorderSheetColumns(next);
      updateStructure(result.currencies, result.customColumns);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  // ─── Remove ─────────────────────────────────────────────────────────────────

  const startRemove = (colName: string) => {
    clearActionBanners();
    setIsAddingCurrency(false);
    setIsAddingColumn(false);
    setRenamingColumn(null);
    setConfirmRemoveName(colName);
  };

  const executeRemove = async (): Promise<void> => {
    if (!confirmRemoveName) return;
    setActionBusy(true);
    try {
      const result = await googleSheetsService.removeSheetColumn(confirmRemoveName);
      updateStructure(result.currencies, result.customColumns);
      setConfirmRemoveName(null);
      setActionSuccess(`Column "${confirmRemoveName}" removed.`);
    } catch (err) {
      setActionError((err as Error).message);
      setConfirmRemoveName(null);
    } finally {
      setActionBusy(false);
    }
  };

  // ─── Spreadsheet Save ──────────────────────────────────────────────────────

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
        setSuccess("Spreadsheet removed. Setup is not complete.");
        return;
      }
      const { config: nextConfig, setupReport: report } = await googleSheetsService.saveConfig(url);
      saveConfig(nextConfig);
      setSetupReport(report);
      setShowMappingEditor(false);
      setSuccess("Spreadsheet is configured and validated.");
      trackEvent("setup_saved");
    } catch (saveError) {
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

  // ─── Create Spreadsheet (fresh path) ──────────────────────────────────────────────

  const onCreateSpreadsheet = async (): Promise<void> => {
    setError(null);
    setSuccess(null);
    setSetupReport(null);
    setIsCreating(true);
    try {
      const name = newSheetName.trim() || undefined;
      const { config: nextConfig, setupReport: report } = await googleSheetsService.createSpreadsheet(name);
      saveConfig(nextConfig);
      setSetupReport(report);
      setSuccess("Your spreadsheet has been created and is ready to use.");
      trackEvent("setup_created");
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const onResetAndExit = async (): Promise<void> => {
    if (!window.confirm("This action will reset the previously provided link. Are you sure?")) return;
    await saveSpreadsheet("");
    navigate("/home");
  };

  const busy = isSaving || isPicking;

  const pageTitle =
    setupPath === "configured" ? "Spreadsheet settings" :
    setupPath === "existing" ? "Connect existing sheet" :
    setupPath === "fresh" ? "Create your spreadsheet" :
    "Set up Quick Expense";

  return (
    <Layout title={pageTitle}>

      {/* ── Path: choose ── */}
      {setupPath === "choose" ? (
        <>
          {isConfigLoading ? (
            <LoadingBlock label="Checking your current setup status…" />
          ) : null}
          {!isConfigLoading && configError ? (
            <StatusBanner variant="error" message={configError} />
          ) : null}
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
                onClick={() => setSetupPath("fresh")}
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
                onClick={() => setSetupPath("existing")}
              >
                Connect a spreadsheet
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* ── Path: fresh (Story 3 — programmatic spreadsheet creation) ── */}
      {setupPath === "fresh" ? (
        <>
          <button className="setup-back-link" type="button" onClick={() => { setError(null); setSuccess(null); setSetupReport(null); setSetupPath("choose"); }}>
            ← Back to options
          </button>

          {error ? <StatusBanner variant="error" message={error} /> : null}
          {success ? <StatusBanner variant="success" message={success} /> : null}
          {setupReport ? (
            <ul className="setup-report">
              <li className="setup-report-item">
                {setupReport.tabAction === "created" ? "✓ Expenses tab created" : "✓ Expenses tab found"}
              </li>
              <li className="setup-report-item">
                {setupReport.headersAction === "created" ? "✓ Column headers created" : "✓ Column headers valid"}
              </li>
            </ul>
          ) : null}

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
              onClick={() => void onCreateSpreadsheet()}
            >
              {isCreating ? "Creating…" : "Create my spreadsheet"}
            </button>
          </div>
          {isCreating ? <LoadingBlock label="Creating your spreadsheet…" /> : null}
        </>
      ) : null}

      {/* ── Path: existing (connect and validate a sheet URL) ── */}
      {setupPath === "existing" ? (
        <>
          <button
            className="setup-back-link"
            type="button"
            onClick={() => {
              setSetupPath("choose");
              setError(null);
              setHeaderDetails(null);
              setSuccess(null);
              setSetupReport(null);
            }}
          >
            ← Back to options
          </button>

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
              <span className="setup-card-title">
                Google Sheets URL
                {(error || headerDetails) ? (
                  <span className="setup-card-title-warning" aria-label="Column structure issue detected">⚠</span>
                ) : null}
              </span>
            </div>

            <button
              type="button"
              className="setup-structure-guide-toggle"
              aria-expanded={structureGuideOpen}
              onClick={() => setStructureGuideOpen((v) => !v)}
            >
              {structureGuideOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              What structure does my sheet need?
            </button>
            {structureGuideOpen ? (
              <div className="setup-structure-guide">
                <p className="setup-structure-guide-intro">Your sheet’s <strong>Expenses</strong> tab must have a header row in this order:</p>
                <ol className="setup-structure-guide-list">
                  <li><strong>Date</strong> — mandatory</li>
                  <li><strong>Currency columns</strong> (e.g. EUR, PLN) — optional, any number</li>
                  <li><strong>USD</strong> — mandatory</li>
                  <li><strong>Category</strong> — mandatory</li>
                  <li><strong>Spent By</strong> — mandatory</li>
                  <li><strong>Comment</strong> — mandatory</li>
                  <li><strong>Custom columns</strong> (any names) — optional, after Comment</li>
                </ol>
                <p className="setup-structure-guide-note">If the <strong>Expenses</strong> tab doesn’t exist, QuickExpense will create it with a default structure.</p>
                <br/>
                <p className="setup-structure-guide-note">QuickExpense only reads and writes the <strong>Expenses</strong> tab. Other sheets in your workbook are never accessed or modified.</p>              </div>
            ) : null}

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
                  {isSaving ? "Checking…" : "Check compatibility"}
                </button>
                <button
                    className="btn btn-secondary"
                    disabled={busy || !config}
                    type="button"
                    title={!config ? "This action is not applicable in the current context" : undefined}
                    onClick={() => void onResetAndExit()}
                    style={{ width: "auto", flexShrink: 0 }}
                  >
                    Reset and exit
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

          {busy ? <LoadingBlock label={isPicking ? "Opening file picker…" : "Checking compatibility…"} /> : null}

          {error ? <StatusBanner variant="error" message={error} /> : null}

          {headerDetails ? (
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
                        {row.status === "match" && <span className="header-mismatch-badge header-mismatch-badge--match">✓ Match</span>}
                        {row.status === "mismatch" && <span className="header-mismatch-badge header-mismatch-badge--mismatch">✗ Mismatch</span>}
                        {row.status === "missing" && <span className="header-mismatch-badge header-mismatch-badge--missing">− Missing</span>}
                        {row.status === "extra" && <span className="header-mismatch-badge header-mismatch-badge--extra">+ Extra</span>}
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
                  onClick={() => setShowMappingEditor(true)}
                >
                  Map columns →
                </button>
              ) : null}
              {showMappingEditor && headerDetails.detectedColumns.length > 0 ? (
                <div style={{ marginTop: "var(--space-4)" }}>
                  <ColumnMappingEditor
                    detectedColumns={headerDetails.detectedColumns}
                    onSaved={() => {
                      setShowMappingEditor(false);
                      void saveSpreadsheet(spreadsheetUrl.trim());
                    }}
                    onCancel={() => setShowMappingEditor(false)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* ── Path: configured (sheet structure management) ── */}
      {setupPath === "configured" ? (
        <>
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

          {config ? (
            <div className="home-status-card connected">
              <FileSpreadsheet size={20} className="home-status-icon" style={{ color: "var(--color-success)" }} aria-hidden />
              <div className="home-status-content">
                <div className="home-status-label">Connected</div>
                <div className="home-status-detail">
                  <a
                    className="setup-connected-url-link"
                    href={config.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {config.spreadsheetUrl}
                  </a>
                </div>
                <div className="config-mode-badge-row">
                  <span
                    className={`config-mode-badge config-mode-badge--${config.configMode}`}
                    title={configModeTooltip(config.configMode)}
                  >
                    {configModeBadgeLabel(config.configMode)}
                  </span>
                  {config.configMode === "config-invalid" ? (
                    <span className="config-mode-fix-hint">
                      Your Config sheet was found but could not be read.{" "}
                      <button
                        type="button"
                        className="btn-inline"
                        onClick={() => setSetupPath("existing")}
                      >
                        Fix it &rarr;
                      </button>
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="home-status-action"
                onClick={() => setSetupPath("choose")}
              >
                Change
              </button>
            </div>
          ) : null}

          <div className="card setup-card">
            <div className="setup-card-icon">
              <TableProperties size={24} aria-hidden />
              <span className="setup-card-title">Sheet Structure</span>
            </div>

            {actionError ? <StatusBanner variant="error" message={actionError} /> : null}
            {actionSuccess ? <StatusBanner variant="success" message={actionSuccess} /> : null}

            <ul className="custom-columns-list">
            {columns.map((col) => {
              const isMandatory = col.type === "mandatory-field" || col.type === "mandatory-currency";
              const isCurrency = col.type === "optional-currency";
              const isCustom = col.type === "custom-column";
              const currencyIndex = isCurrency ? currencies.indexOf(col.name) : -1;
              const customIndex = isCustom ? customColumns.indexOf(col.name) : -1;

              if (renamingColumn === col.name) {
                return (
                  <li key={col.name} className="custom-columns-row">
                    <form onSubmit={(e) => void submitRename(e)} className="custom-columns-edit-form">
                      <input
                        className="input custom-columns-name-input"
                        value={renameValue}
                        autoFocus
                        maxLength={30}
                        onChange={(e) => { setRenameValue(e.target.value); setFieldError(null); }}
                      />
                      {fieldError ? <div className="field-error">{fieldError}</div> : null}
                      <div className="custom-columns-edit-actions">
                        <button className="btn-icon" type="submit" disabled={actionBusy} aria-label="Save rename">
                          <Check size={16} />
                        </button>
                        <button className="btn-icon" type="button" onClick={cancelRenaming} aria-label="Cancel rename">
                          <X size={16} />
                        </button>
                      </div>
                    </form>
                  </li>
                );
              }

              if (confirmRemoveName === col.name) {
                return (
                  <li key={col.name} className="custom-columns-row">
                    <div className="custom-columns-confirm">
                      <span className="custom-columns-confirm-text">
                        Remove &ldquo;{col.name}&rdquo;?
                      </span>
                      <button className="btn btn-danger btn-sm" type="button" disabled={actionBusy} onClick={() => void executeRemove()}>
                        Remove
                      </button>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setConfirmRemoveName(null)}>
                        Cancel
                      </button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={col.name} className="custom-columns-row">
                  <span className="custom-columns-name">
                    {col.name}
                    <span className={`custom-columns-type-badge custom-columns-type-badge--${col.type}`}>{typeLabel(col.type)}</span>
                  </span>
                  {!isMandatory ? (
                    <div className="custom-columns-actions">
                      {isCurrency ? (
                        <>
                          <button
                            className="btn-icon"
                            type="button"
                            disabled={actionBusy || currencyIndex === 0}
                            onClick={() => void moveCurrency(currencyIndex, -1)}
                            aria-label="Move up"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            className="btn-icon"
                            type="button"
                            disabled={actionBusy || currencyIndex === currencies.length - 1}
                            onClick={() => void moveCurrency(currencyIndex, 1)}
                            aria-label="Move down"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </>
                      ) : null}
                      {isCustom ? (
                        <>
                          <button
                            className="btn-icon"
                            type="button"
                            disabled={actionBusy || customIndex === 0}
                            onClick={() => void moveCustomColumn(customIndex, -1)}
                            aria-label="Move up"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            className="btn-icon"
                            type="button"
                            disabled={actionBusy || customIndex === customColumns.length - 1}
                            onClick={() => void moveCustomColumn(customIndex, 1)}
                            aria-label="Move down"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </>
                      ) : null}
                      <button
                        className="btn-icon"
                        type="button"
                        disabled={actionBusy}
                        onClick={() => startRenaming(col.name)}
                        aria-label={`Rename ${col.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="btn-icon btn-icon-danger"
                        type="button"
                        disabled={actionBusy}
                        onClick={() => startRemove(col.name)}
                        aria-label={`Remove ${col.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* ── Column mapping sub-section ── */}
          <div className="column-mapping-section">
            <button
              type="button"
              className="column-mapping-section-toggle"
              aria-expanded={mappingSectionOpen}
              onClick={() => {
                setMappingSectionOpen((v) => !v);
                setMappingEditorOpen(false);
                setMappingSuccess(null);
              }}
            >
              {mappingSectionOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              Column mapping
              {mappingData ? (
                <span className={`config-mode-badge config-mode-badge--${mappingData.mode}`}>
                  {mappingData.mode === "config-driven" ? "Config detected" : "Not configured"}
                </span>
              ) : null}
            </button>

            {mappingSectionOpen ? (
              <div className="column-mapping-section-body">
                {mappingLoadError ? (
                  <>
                    <StatusBanner variant="error" message={`Could not load mapping — ${mappingLoadError}`} />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setMappingLoadError(null);
                        void googleSheetsService
                          .getColumnMapping()
                          .then(setMappingData)
                          .catch((err) => setMappingLoadError((err as Error).message));
                      }}
                    >
                      Retry
                    </button>
                  </>
                ) : !mappingData ? (
                  <LoadingBlock label="Loading mapping…" />
                ) : mappingData.mode !== "config-driven" ? (
                  <p className="muted text-sm">No column mapping is configured. Standard column names apply.</p>
                ) : (
                  <>
                    {mappingSuccess ? <StatusBanner variant="success" message={mappingSuccess} /> : null}
                    {!mappingEditorOpen ? (
                      <>
                        <table className="column-mapping-table">
                          <thead>
                            <tr>
                              <th>QuickExpense field</th>
                              <th>Your column name</th>
                            </tr>
                          </thead>
                          <tbody>
                            {REQUIRED_QE_FIELDS.map((field) => (
                              <tr key={field}>
                                <td className="column-mapping-field-name">{field}</td>
                                <td>{mappingData.mapping?.[field] ?? field}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ marginTop: "var(--space-3)" }}
                          onClick={() => { setMappingSuccess(null); setMappingEditorOpen(true); }}
                        >
                          Edit mapping
                        </button>
                      </>
                    ) : (
                      <ColumnMappingEditor
                        detectedColumns={mappingData.detectedColumns}
                        initialMapping={mappingData.mapping ?? undefined}
                        onSaved={() => {
                          setMappingEditorOpen(false);
                          setMappingSuccess("Mapping updated.");
                          void googleSheetsService
                            .getColumnMapping()
                            .then(setMappingData)
                            .catch(() => undefined);
                        }}
                        onCancel={() => setMappingEditorOpen(false)}
                      />
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>

          {isAddingCurrency ? (
            <form onSubmit={(e) => void submitAddCurrency(e)} className="custom-columns-add-form" style={{ marginTop: "var(--space-3)" }}>
              <input
                className="input custom-columns-name-input"
                value={newCurrencyCode}
                autoFocus
                maxLength={10}
                placeholder="Currency code (e.g., EUR)…"
                onChange={(e) => { setNewCurrencyCode(e.target.value); setFieldError(null); }}
                list="currency-suggestions"
              />
              {currencyDictionary ? (
                <datalist id="currency-suggestions">
                  {currencyDictionary.currencies
                    .filter((c) => !currencies.includes(c.code))
                    .map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                </datalist>
              ) : null}
              {fieldError ? <div className="field-error">{fieldError}</div> : null}
              <div className="custom-columns-edit-actions">
                <button className="btn btn-primary btn-sm" type="submit" disabled={actionBusy}>
                  Add
                </button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={cancelAddingCurrency}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {isAddingColumn ? (
            <form onSubmit={(e) => void submitAddColumn(e)} className="custom-columns-add-form" style={{ marginTop: "var(--space-3)" }}>
              <input
                className="input custom-columns-name-input"
                value={newColumnName}
                autoFocus
                maxLength={30}
                placeholder="New field name…"
                onChange={(e) => { setNewColumnName(e.target.value); setFieldError(null); }}
              />
              {fieldError ? <div className="field-error">{fieldError}</div> : null}
              <div className="custom-columns-edit-actions">
                <button className="btn btn-primary btn-sm" type="submit" disabled={actionBusy}>
                  Add
                </button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={cancelAddingColumn}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {!isAddingCurrency && !isAddingColumn ? (
            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={actionBusy || !currencyDictionary || currencies.length >= maxOptionalCurrencies}
                onClick={startAddingCurrency}
                title={
                  currencyDictionary && currencies.length >= maxOptionalCurrencies
                    ? `Maximum of ${maxOptionalCurrencies} currencies reached`
                    : undefined
                }
              >
                <Plus size={16} aria-hidden />
                Add currency
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={actionBusy || customColumns.length >= MAX_CUSTOM_COLUMNS}
                onClick={startAddingColumn}
                title={customColumns.length >= MAX_CUSTOM_COLUMNS ? `Maximum of ${MAX_CUSTOM_COLUMNS} custom fields reached` : undefined}
              >
                <Plus size={16} aria-hidden />
                Add column
              </button>
            </div>
          ) : null}
          </div>
        </>
      ) : null}

    </Layout>
  );
}
