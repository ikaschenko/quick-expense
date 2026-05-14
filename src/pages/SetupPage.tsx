import { FormEvent, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, X, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, TableProperties } from "lucide-react";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { AppError, CurrencyDictionary, HeaderDetails, SetupReport } from "../types/expense";
import { resolveSetupBannerState } from "../utils/setupStatus";
import { validateColumnName } from "../utils/spreadsheet";

type ColumnType = "mandatory-field" | "mandatory-currency" | "optional-currency" | "custom-column";

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

const MAX_OPTIONAL_CURRENCIES = 10;
const MAX_CUSTOM_COLUMNS = 10;

export function SetupPage(): JSX.Element {
  const { config, isConfigLoading, error: configError, saveConfig, refreshConfig, updateStructure } = useConfig();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [headerDetails, setHeaderDetails] = useState<HeaderDetails | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [setupReport, setSetupReport] = useState<SetupReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [hasInvalidSetup, setHasInvalidSetup] = useState(false);

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

  useEffect(() => {
    setSpreadsheetUrl(config?.spreadsheetUrl ?? "");
  }, [config]);

  // Load currency dictionary for autocomplete
  useEffect(() => {
    if (config?.spreadsheetId) {
      void googleSheetsService.getAvailableCurrencies().then(setCurrencyDictionary).catch(() => undefined);
    }
  }, [config?.spreadsheetId]);

  const columns = useMemo(
    () => classifyColumns(config?.currencies ?? [], config?.customColumns ?? []),
    [config?.currencies, config?.customColumns],
  );

  const currencies = config?.currencies ?? [];
  const customColumns = config?.customColumns ?? [];

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
          <span className="setup-card-title">Google Sheets URL</span>
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

      {/* Column Reflection — visible only when spreadsheet is connected */}
      {config?.spreadsheetId ? (
        <div className="card setup-card" style={{ marginTop: "var(--space-4)" }}>
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
                disabled={actionBusy || currencies.length >= MAX_OPTIONAL_CURRENCIES}
                onClick={startAddingCurrency}
                title={currencies.length >= MAX_OPTIONAL_CURRENCIES ? `Maximum of ${MAX_OPTIONAL_CURRENCIES} currencies reached` : undefined}
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
      ) : null}

      {busy ? <LoadingBlock label={isPicking ? "Opening file picker…" : "Validating spreadsheet…"} /> : null}
    </Layout>
  );
}
