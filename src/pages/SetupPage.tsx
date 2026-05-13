import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileSpreadsheet, Info, Coins, X } from "lucide-react";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { AppError, CurrencyDictionary, CurrencyEntry, HeaderDetails, SetupReport } from "../types/expense";
import { resolveSetupBannerState } from "../utils/setupStatus";

export function SetupPage(): JSX.Element {
  const { config, isConfigLoading, error: configError, saveConfig, refreshConfig, saveCurrencies } = useConfig();
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

      {/* Currency configuration card — visible only when spreadsheet is connected */}
      {config?.spreadsheetId && dictionary ? (
        <div className="card setup-card" style={{ marginTop: "var(--space-4)" }}>
          <div className="setup-card-icon">
            <Coins size={24} aria-hidden />
            <span className="setup-card-title">Currency Configuration</span>
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

      <div className="setup-trust">
        <Info size={16} aria-hidden />
        <span>Your data stays in your spreadsheet. We never store your expenses.</span>
      </div>

      {/* Customize Columns link — visible only when spreadsheet is connected */}
      {config?.spreadsheetId ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Link to="/columns" className="btn btn-secondary">
            Customize columns →
          </Link>
        </div>
      ) : null}

      {busy ? <LoadingBlock label={isPicking ? "Opening file picker…" : "Validating spreadsheet…"} /> : null}
    </Layout>
  );
}
