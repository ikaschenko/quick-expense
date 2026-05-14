import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Coins, X, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, TableProperties, CircleHelp } from "lucide-react";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { AppError, CustomColumn, CurrencyDictionary, CurrencyEntry, HeaderDetails, SetupReport } from "../types/expense";
import { resolveSetupBannerState } from "../utils/setupStatus";
import { validateColumnName } from "../utils/spreadsheet";
import { MAX_CUSTOM_COLUMNS } from "../constants/expenses";

export function SetupPage(): JSX.Element {
  const { config, isConfigLoading, error: configError, saveConfig, refreshConfig, saveCurrencies, saveCustomColumns } = useConfig();
  const navigate = useNavigate();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [headerDetails, setHeaderDetails] = useState<HeaderDetails | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [setupReport, setSetupReport] = useState<SetupReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [hasInvalidSetup, setHasInvalidSetup] = useState(false);

  // Currency config state
  const [dictionary, setDictionary] = useState<CurrencyDictionary | null>(null);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [currencySearch, setCurrencySearch] = useState("");
  const [isSavingCurrencies, setIsSavingCurrencies] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [currencySuccess, setCurrencySuccess] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Custom fields state
  const [columns, setColumns] = useState<CustomColumn[]>(config?.customColumns ?? []);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [showColumnsHelp, setShowColumnsHelp] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setSpreadsheetUrl(config?.spreadsheetUrl ?? "");
  }, [config]);

  // Load currency dictionary and pre-populate selection from config
  useEffect(() => {
    if (!config) return;
    void googleSheetsService.getAvailableCurrencies().then(setDictionary).catch(() => undefined);
  }, [config]);

  useEffect(() => {
    if (config?.currencies) {
      setSelectedCurrencies(config.currencies);
    }
  }, [config?.currencies]);

  useEffect(() => {
    setColumns(config?.customColumns ?? []);
  }, [config?.customColumns]);

  const currencyMap = useMemo(() => {
    if (!dictionary) return new Map<string, CurrencyEntry>();
    return new Map(dictionary.currencies.map((c) => [c.code, c]));
  }, [dictionary]);

  const filteredCurrencies = useMemo(() => {
    if (!dictionary) return [];
    const q = currencySearch.toLowerCase();
    return dictionary.currencies.filter(
      (c) =>
        !selectedCurrencies.includes(c.code) &&
        (c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)),
    );
  }, [dictionary, currencySearch, selectedCurrencies]);

  const toggleCurrency = useCallback(
    (code: string) => {
      setCurrencySuccess(null);
      setCurrencyError(null);
      setSelectedCurrencies((prev) => {
        if (prev.includes(code)) return prev.filter((c) => c !== code);
        if (dictionary && prev.length >= dictionary.maxOptional) return prev;
        return [...prev, code];
      });
    },
    [dictionary],
  );

  const onSaveCurrencies = async (): Promise<void> => {
    setCurrencyError(null);
    setCurrencySuccess(null);
    setIsSavingCurrencies(true);
    try {
      const result = await googleSheetsService.saveUserCurrencies(selectedCurrencies);
      saveCurrencies(result.currencies, result.sheetCurrencies);
      setCurrencySuccess("Currency columns updated.");
      trackEvent("currencies_saved", { count: result.currencies.length });
    } catch (err) {
      setCurrencyError((err as Error).message);
    } finally {
      setIsSavingCurrencies(false);
    }
  };

  function clearBanners() {
    setBannerError(null);
    setBannerSuccess(null);
  }

  // ─── Add ──────────────────────────────────────────────────────────────────

  const startAdding = () => {
    clearBanners();
    setEditingId(null);
    setFieldError(null);
    setNewName("");
    setIsAdding(true);
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setNewName("");
    setFieldError(null);
  };

  const submitAdd = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const err = validateColumnName(newName, columns.map((c) => c.name));
    if (err) { setFieldError(err); return; }
    setSaving(true);
    setFieldError(null);
    try {
      const added = await googleSheetsService.addCustomColumn(newName.trim());
      const next = [...columns, added];
      setColumns(next);
      saveCustomColumns(next);
      setIsAdding(false);
      setNewName("");
      setBannerSuccess(`Column "${added.name}" added.`);
    } catch (err) {
      setBannerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Rename ───────────────────────────────────────────────────────────────

  const startEditing = (col: CustomColumn) => {
    clearBanners();
    setIsAdding(false);
    setFieldError(null);
    setEditingId(col.id);
    setEditName(col.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setFieldError(null);
  };

  const submitRename = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (editingId === null) return;
    const target = columns.find((c) => c.id === editingId);
    if (!target) return;
    const err = validateColumnName(editName, columns.map((c) => c.name), target.name);
    if (err) { setFieldError(err); return; }
    setSaving(true);
    setFieldError(null);
    try {
      const renamed = await googleSheetsService.renameCustomColumn(editingId, editName.trim());
      const next = columns.map((c) => c.id === editingId ? renamed : c);
      setColumns(next);
      saveCustomColumns(next);
      setEditingId(null);
      setBannerSuccess(`Column renamed to "${renamed.name}".`);
    } catch (err) {
      setBannerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Reorder ──────────────────────────────────────────────────────────────

  const moveColumn = async (index: number, direction: -1 | 1): Promise<void> => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= columns.length) return;
    clearBanners();
    const next = [...columns];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setSaving(true);
    try {
      const reordered = await googleSheetsService.reorderCustomColumns(next.map((c) => c.id));
      setColumns(reordered);
      saveCustomColumns(reordered);
    } catch (err) {
      setBannerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Remove ───────────────────────────────────────────────────────────────

  const confirmRemove = (col: CustomColumn) => {
    clearBanners();
    setConfirmRemoveId(col.id);
  };

  const executeRemove = async (): Promise<void> => {
    if (confirmRemoveId === null) return;
    const target = columns.find((c) => c.id === confirmRemoveId);
    if (!target) return;
    setSaving(true);
    try {
      const result = await googleSheetsService.removeCustomColumn(confirmRemoveId);
      const next = columns.filter((c) => c.id !== confirmRemoveId);
      setColumns(next);
      saveCustomColumns(next);
      setConfirmRemoveId(null);
      setBannerSuccess(
        result.hardDeleted
          ? `Column "${target.name}" deleted.`
          : `Column "${target.name}" hidden (data preserved in spreadsheet).`,
      );
    } catch (err) {
      setBannerError((err as Error).message);
      setConfirmRemoveId(null);
    } finally {
      setSaving(false);
    }
  };

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

  const atLimit = columns.length >= MAX_CUSTOM_COLUMNS;
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

      {/* Currency configuration card — visible only when spreadsheet is connected */}
      {config?.spreadsheetId && dictionary ? (
        <div className="card setup-card" style={{ marginTop: "var(--space-4)" }}>
          <div className="setup-card-icon">
            <Coins size={24} aria-hidden />
            <span className="setup-card-title">Currencies</span>
          </div>

          <div className="input-group">
            <label className="input-label">Baseline Currency</label>
            <div className="currency-baseline-pill">USD — US Dollar</div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="currency-search">
              Optional Currencies (up to {dictionary.maxOptional})
            </label>

            {/* Selected chips */}
            {selectedCurrencies.length > 0 ? (
              <div className="currency-selected-chips">
                {selectedCurrencies.map((code) => {
                  const entry = currencyMap.get(code);
                  return (
                    <span key={code} className="currency-chip">
                      {code}{entry ? ` — ${entry.name}` : ""}
                      <button
                        type="button"
                        className="currency-chip-remove"
                        onClick={() => toggleCurrency(code)}
                        aria-label={`Remove ${code}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}

            {/* Searchable dropdown */}
            <div className="currency-dropdown-wrapper" ref={dropdownRef}>
              <input
                id="currency-search"
                className="input"
                value={currencySearch}
                onChange={(e) => {
                  setCurrencySearch(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onClick={() => setIsDropdownOpen(true)}
                onKeyDown={(e) => { if (e.key === "Escape") setIsDropdownOpen(false); }}
                placeholder={selectedCurrencies.length >= dictionary.maxOptional ? `Limit of ${dictionary.maxOptional} reached` : "Search currencies…"}
                autoComplete="off"
              />
              {isDropdownOpen && filteredCurrencies.length > 0 ? (
                <ul className="currency-dropdown-list" role="listbox">
                  {filteredCurrencies.map((c) => (
                    <li
                      key={c.code}
                      className="currency-dropdown-item"
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggleCurrency(c.code);
                        setCurrencySearch("");
                      }}
                    >
                      <strong>{c.code}</strong> — {c.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {currencyError ? <StatusBanner variant="error" message={currencyError} /> : null}
          {currencySuccess ? <StatusBanner variant="success" message={currencySuccess} /> : null}

          <button
            className="btn btn-primary"
            disabled={isSavingCurrencies}
            type="button"
            onClick={() => void onSaveCurrencies()}
          >
            {isSavingCurrencies ? "Saving…" : "Save Currencies"}
          </button>
        </div>
      ) : null}

      {/* Custom fields card — visible only when spreadsheet is connected */}
      {config?.spreadsheetId ? (
        <div className="card setup-card" style={{ marginTop: "var(--space-4)" }}>
          <div className="setup-card-icon">
            <TableProperties size={24} aria-hidden />
            <span className="setup-card-title">Custom fields</span>
            <button
              type="button"
              className="section-help-btn"
              onClick={() => setShowColumnsHelp((v) => !v)}
              aria-label="About custom fields"
            >
              <CircleHelp size={16} />
            </button>
          </div>

          {showColumnsHelp ? (
            <div className="section-help-popover">
              Here you may define Custom Columns for your spreadsheet. Custom Columns appear after the
              fixed fields (Date, Amount, Category, SpentBy, Comment) on the &ldquo;Add Expense&rdquo;
              screen and in your spreadsheet. You may add up to {MAX_CUSTOM_COLUMNS} custom columns,
              names must be unique.
            </div>
          ) : null}

          {bannerError ? <StatusBanner variant="error" message={bannerError} /> : null}
          {bannerSuccess ? <StatusBanner variant="success" message={bannerSuccess} /> : null}

          {columns.length === 0 && !isAdding ? (
            <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
              No custom fields yet.
            </p>
          ) : null}

          <ul className="custom-columns-list">
            {columns.map((col, index) => (
              <li key={col.id} className="custom-columns-row">
                {editingId === col.id ? (
                  <form onSubmit={(e) => void submitRename(e)} className="custom-columns-edit-form">
                    <input
                      className="input custom-columns-name-input"
                      value={editName}
                      autoFocus
                      maxLength={30}
                      onChange={(e) => { setEditName(e.target.value); setFieldError(null); }}
                    />
                    {fieldError ? <div className="field-error">{fieldError}</div> : null}
                    <div className="custom-columns-edit-actions">
                      <button className="btn-icon" type="submit" disabled={saving} aria-label="Save rename">
                        <Check size={16} />
                      </button>
                      <button className="btn-icon" type="button" onClick={cancelEditing} aria-label="Cancel rename">
                        <X size={16} />
                      </button>
                    </div>
                  </form>
                ) : confirmRemoveId === col.id ? (
                  <div className="custom-columns-confirm">
                    <span className="custom-columns-confirm-text">
                      Remove &ldquo;{col.name}&rdquo;?
                    </span>
                    <button className="btn btn-danger btn-sm" type="button" disabled={saving} onClick={() => void executeRemove()}>
                      Remove
                    </button>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => setConfirmRemoveId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="custom-columns-name">{col.name}</span>
                    <div className="custom-columns-actions">
                      <button
                        className="btn-icon"
                        type="button"
                        disabled={saving || index === 0}
                        onClick={() => void moveColumn(index, -1)}
                        aria-label="Move up"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        type="button"
                        disabled={saving || index === columns.length - 1}
                        onClick={() => void moveColumn(index, 1)}
                        aria-label="Move down"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        type="button"
                        disabled={saving}
                        onClick={() => startEditing(col)}
                        aria-label={`Rename ${col.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="btn-icon btn-icon-danger"
                        type="button"
                        disabled={saving}
                        onClick={() => confirmRemove(col)}
                        aria-label={`Remove ${col.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {isAdding ? (
            <form onSubmit={(e) => void submitAdd(e)} className="custom-columns-add-form" style={{ marginTop: "var(--space-3)" }}>
              <input
                className="input custom-columns-name-input"
                value={newName}
                autoFocus
                maxLength={30}
                placeholder="New field name…"
                onChange={(e) => { setNewName(e.target.value); setFieldError(null); }}
              />
              {fieldError ? <div className="field-error">{fieldError}</div> : null}
              <div className="custom-columns-edit-actions">
                <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
                  Add
                </button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={cancelAdding}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={saving || atLimit}
              onClick={startAdding}
              style={{ marginTop: columns.length > 0 ? "var(--space-3)" : undefined }}
              title={atLimit ? `Maximum of ${MAX_CUSTOM_COLUMNS} custom fields reached` : undefined}
            >
              <Plus size={16} aria-hidden />
              Add field
            </button>
          )}

          {atLimit ? (
            <p style={{ color: "var(--color-text-muted)", marginTop: "var(--space-2)", fontSize: "var(--font-size-sm)" }}>
              Maximum of {MAX_CUSTOM_COLUMNS} custom fields reached.
            </p>
          ) : null}
        </div>
      ) : null}

      {busy ? <LoadingBlock label={isPicking ? "Opening file picker…" : "Validating spreadsheet…"} /> : null}
    </Layout>
  );
}
