import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { Check, Calendar, RotateCcw, House } from "lucide-react";
import DatePicker from "react-datepicker";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";
import { currencyService } from "../services/currency";
import { googleSheetsService } from "../services/googleSheets";
import {
  CurrencyDictionary,
  ExpenseDraft,
  ExpenseRecord,
  FxRateBackupPayload,
  ManualFxRates,
} from "../types/expense";
import { formatLocalDate, getTodayLocalDate, detectDateFormat } from "../utils/date";
import { buildCommentSuggestions, expenseDraftToRowValues } from "../utils/spreadsheet";
import { parseOptionalDecimal, parsePositiveDecimal, validateExpenseDraft } from "../utils/validation";
import { AutosuggestInput } from "../components/AutosuggestInput";
import { trackEvent } from "../services/analytics";

function formatColumnLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function createInitialDraft(defaultEmail: string, currencies: string[], customColumns: string[]): ExpenseDraft {
  const currencyAmounts: Record<string, string> = {};
  for (const code of currencies) {
    currencyAmounts[code] = "";
  }
  const customFields: Record<string, string> = {};
  for (const col of customColumns) {
    customFields[col] = "";
  }
  return {
    Date: getTodayLocalDate(),
    USD: "",
    Category: "",
    spentBy: defaultEmail,
    Comment: "",
    currencyAmounts,
    customFields,
  };
}

function createEmptyFxRates(currencies: string[]): ManualFxRates {
  const rates: ManualFxRates = {};
  for (const code of currencies) {
    rates[code] = "";
  }
  return rates;
}

function createDraftFromRecord(record: ExpenseRecord, currencies: string[], customColumns: string[]): ExpenseDraft {
  const currencyAmounts: Record<string, string> = {};
  for (const code of currencies) {
    currencyAmounts[code] = record.currencyAmounts[code] ?? "";
  }
  const customFields: Record<string, string> = {};
  for (const col of customColumns) {
    customFields[col] = record.customFields?.[col] ?? "";
  }
  return {
    Date: record.Date,
    USD: record.USD,
    Category: record.Category,
    spentBy: record.spentBy,
    Comment: record.Comment,
    currencyAmounts,
    customFields,
  };
}

function deriveInitialFxRates(record: ExpenseRecord, currencies: string[]): ManualFxRates {
  const rates: ManualFxRates = {};
  const usdValue = parseFloat(record.USD);
  for (const code of currencies) {
    const amount = parseFloat(record.currencyAmounts[code] ?? "");
    if (!isNaN(usdValue) && usdValue !== 0 && !isNaN(amount) && amount !== 0) {
      rates[code] = (Math.abs(amount) / Math.abs(usdValue)).toFixed(2);
    } else {
      rates[code] = "";
    }
  }
  return rates;
}

function getPreferredCurrency(
  record: { currencyAmounts?: Record<string, string> } | null | undefined,
  currencies: string[],
): string | null {
  if (currencies.length === 0) return null;
  if (!record?.currencyAmounts) return currencies[0];

  for (const code of currencies) {
    if (record.currencyAmounts[code]?.trim()) {
      return code;
    }
  }

  return currencies[0];
}

function parseNonUsdValues(
  draft: ExpenseDraft,
  currencies: string[],
): Partial<Record<string, number>> | null {
  try {
    const result: Partial<Record<string, number>> = {};
    for (const code of currencies) {
      result[code] = parseOptionalDecimal(draft.currencyAmounts[code] ?? "") ?? undefined;
    }
    return result;
  } catch {
    return null;
  }
}

function buildFxBackupPayload(
  draft: ExpenseDraft,
  rates: ManualFxRates,
  currencies: string[],
): FxRateBackupPayload {
  const ratesPayload: Record<string, string | null> = {};
  const amountsPayload: Record<string, string> = { USD: draft.USD };
  for (const code of currencies) {
    ratesPayload[code] = rates[code]?.trim() || null;
    amountsPayload[code] = draft.currencyAmounts[code] ?? "";
  }
  return {
    expenseDate: draft.Date,
    rates: ratesPayload,
    amounts: amountsPayload,
  };
}

export function AddExpensePage(): JSX.Element {
  const auth = useAuth();
  const isViewOnly = auth.session?.guestAccessLevel === 'view';
  const { config } = useConfig();
  const dataset = useDataset();
  const navigate = useNavigate();
  const { rowNumber: rowNumberParam } = useParams<{ rowNumber?: string }>();
  const location = useLocation();

  const isEditMode = !!rowNumberParam;
  const editRowNumber = rowNumberParam ? parseInt(rowNumberParam, 10) : null;
  const editState = (location.state as { record?: ExpenseRecord; origin?: string } | null);
  const editRecord = editState?.record ?? null;
  const editOrigin = editState?.origin ?? "/tail";

  const handleEditBack = useCallback(() => {
    navigate(editOrigin, { state: { editResult: { rowNumber: editRowNumber, saved: false } }, replace: true });
  }, [navigate, editOrigin, editRowNumber]);

  const activeCurrencies = useMemo(() => config?.currencies ?? [], [config?.currencies]);
  const customColumns = useMemo(() => config?.customColumns ?? [], [config?.customColumns]);
  const hiddenColumns = useMemo(() => config?.hiddenColumns ?? [], [config?.hiddenColumns]);
  const visibleCurrencies = useMemo(
    () => activeCurrencies.filter((c) => !hiddenColumns.includes(c)),
    [activeCurrencies, hiddenColumns],
  );
  const isCommentHidden = hiddenColumns.includes("Comment");
  const visibleCustomColumns = useMemo(
    () => customColumns.filter((c) => !hiddenColumns.includes(c)),
    [customColumns, hiddenColumns],
  );

  const [draft, setDraft] = useState<ExpenseDraft>(
    createInitialDraft(auth.session?.givenName ?? auth.session?.email ?? "", activeCurrencies, customColumns),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isInsertingHistorical, setIsInsertingHistorical] = useState(false);
  const [isLoadingFxBackup, setIsLoadingFxBackup] = useState(false);
  const [manualFxRates, setManualFxRates] = useState<ManualFxRates>(
    createEmptyFxRates(activeCurrencies),
  );
  const [fxErrors, setFxErrors] = useState<Partial<Record<string, string>>>({});
  const [activeNonUsdCurrency, setActiveNonUsdCurrency] = useState<string | null>(
    visibleCurrencies[0] ?? null,
  );
  const [hasManuallySelectedCurrency, setHasManuallySelectedCurrency] = useState(false);
  const [currencyDictionary, setCurrencyDictionary] = useState<CurrencyDictionary | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const pendingSaveMode = useRef<'continue' | 'close'>('continue');

  useEffect(() => { amountInputRef.current?.focus(); }, []);

  // Load currency dictionary for tooltips
  useEffect(() => {
    if (activeCurrencies.length > 0) {
      void googleSheetsService.getAvailableCurrencies().then(setCurrencyDictionary).catch(() => undefined);
    }
  }, [activeCurrencies.length]);

  const currencyNameMap = useMemo(() => {
    if (!currencyDictionary) return new Map<string, string>();
    return new Map(currencyDictionary.currencies.map((c) => [c.code, c.name]));
  }, [currencyDictionary]);

  const latestSavedCurrency = useMemo(() => {
    const records = dataset.snapshot?.records;
    const latestRecord = records && records.length > 0 ? records[records.length - 1] : null;
    return getPreferredCurrency(latestRecord, visibleCurrencies);
  }, [dataset.snapshot, visibleCurrencies]);

  const detectedDateFormat = useMemo(
    () => detectDateFormat(dataset.snapshot?.records.map((r) => r.Date) ?? []),
    [dataset.snapshot],
  );

  // Pre-fill draft from the edit record once on mount; normalise the sheet date to ISO.
  // Add mode: the useState initialiser already sets a blank draft with today's ISO date.
  // Both modes init once — background config changes no longer reset in-progress input.
  useEffect(() => {
    if (!isEditMode || !editRecord) return;
    const normalizedDate = detectedDateFormat?.toIso(editRecord.Date) ?? editRecord.Date;
    setDraft(createDraftFromRecord({ ...editRecord, Date: normalizedDate }, activeCurrencies, customColumns));
    setManualFxRates(deriveInitialFxRates(editRecord, activeCurrencies));
    setActiveNonUsdCurrency(getPreferredCurrency(editRecord, visibleCurrencies));
    setHasManuallySelectedCurrency(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  useEffect(() => {
    if (hasManuallySelectedCurrency || !dataset.snapshot) {
      return;
    }

    setActiveNonUsdCurrency(latestSavedCurrency);
  }, [dataset.snapshot, hasManuallySelectedCurrency, latestSavedCurrency]);

  useEffect(() => {
    if (!config) {
      return;
    }

    if (!dataset.snapshot && dataset.status !== "loading") {
      void dataset.loadDataset().catch(() => undefined);
    }
  }, [config, dataset.snapshot, dataset.status, dataset.loadDataset]);

  useEffect(() => {
    if (isEditMode || !config || activeCurrencies.length === 0) {
      return;
    }

    let isActive = true;
    setIsLoadingFxBackup(true);

    void googleSheetsService
      .getLatestFxRateBackup()
      .then((backup) => {
        if (!isActive || !backup) {
          return;
        }

        const rates: ManualFxRates = {};
        for (const code of activeCurrencies) {
          const raw = backup.rates[code];
          rates[code] = raw ? Number(raw).toFixed(2) : "";
        }
        setManualFxRates(rates);
      })
      .catch(() => undefined)
      .finally(() => {
        if (isActive) {
          setIsLoadingFxBackup(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isEditMode, config?.spreadsheetId, activeCurrencies]);

  // Auto-convert non-USD → USD
  const draftCurrencyDeps = activeCurrencies.map((c) => draft.currencyAmounts[c]).join("|");
  useEffect(() => {
    if (activeCurrencies.length === 0) return;

    const nonUsdValues = parseNonUsdValues(draft, activeCurrencies);
    if (!nonUsdValues) return;

    const hasNonUsdValue = Object.values(nonUsdValues).some((v) => v !== undefined);
    if (!hasNonUsdValue) return;

    try {
      const parsedRates = currencyService.parseManualFxRates(manualFxRates, activeCurrencies);
      let allRatesPresent = true;

      for (const code of activeCurrencies) {
        if (nonUsdValues[code] !== undefined && !parsedRates[code]) {
          allRatesPresent = false;
        }
      }

      if (!allRatesPresent) return;

      const usdValue = currencyService.convertToUsdFromRates(nonUsdValues, parsedRates, activeCurrencies);
      const nextUsd = usdValue ? usdValue.toFixed(2) : "";
      setDraft((currentDraft) =>
        currentDraft.USD === nextUsd ? currentDraft : { ...currentDraft, USD: nextUsd },
      );
    } catch {
      // Keep the current USD value until manual FX inputs are corrected.
    }
  }, [draftCurrencyDeps, manualFxRates, activeCurrencies]);

  const suggestionLists = useMemo(() => dataset.distinctValues, [dataset.distinctValues]);
  const commentSuggestions = useMemo(
    () => buildCommentSuggestions(dataset.snapshot?.records ?? []),
    [dataset.snapshot],
  );

  if (!config) {
    return <Navigate to="/setup" replace />;
  }

  if (isEditMode && !editRecord) {
    return <Navigate to="/tail" replace />;
  }

  const updateDraft = <K extends keyof Omit<ExpenseDraft, "currencyAmounts" | "customFields">>(
    key: K,
    value: ExpenseDraft[K],
  ): void => {
    if (success) setSuccess(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const updateCurrencyAmount = (code: string, value: string): void => {
    if (success) setSuccess(null);
    setDraft((d) => ({
      ...d,
      currencyAmounts: { ...d.currencyAmounts, [code]: value },
    }));
  };

  const updateFxRate = (currency: string, value: string): void => {
    if (success) setSuccess(null);
    setManualFxRates((r) => ({ ...r, [currency]: value }));
  };

  const updateCustomField = (name: string, value: string): void => {
    if (success) setSuccess(null);
    setDraft((d) => ({
      ...d,
      customFields: { ...d.customFields, [name]: value },
    }));
  };

  const selectNonUsdCurrency = (currency: string): void => {
    if (success) setSuccess(null);
    setHasManuallySelectedCurrency(true);
    setActiveNonUsdCurrency(currency);

    // Clear other non-USD amounts
    setDraft((d) => {
      const nextAmounts = { ...d.currencyAmounts };
      for (const code of activeCurrencies) {
        if (code !== currency) nextAmounts[code] = "";
      }
      return { ...d, currencyAmounts: nextAmounts };
    });
    setErrors((e) => {
      const next = { ...e };
      for (const code of activeCurrencies) {
        if (code !== currency) delete next[code];
      }
      return next;
    });
    setFxErrors((e) => {
      const next = { ...e };
      for (const code of activeCurrencies) {
        if (code !== currency) delete next[code];
      }
      return next;
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isSaving) return;

    setSuccess(null);
    setError(null);

    const validationErrors = validateExpenseDraft(draft, activeCurrencies);
    const nextFxErrors: Partial<Record<string, string>> = {};

    for (const currency of activeCurrencies) {
      try {
        const amount = parseOptionalDecimal(draft.currencyAmounts[currency] ?? "");
        const rate = parsePositiveDecimal(manualFxRates[currency] ?? "");

        if ((manualFxRates[currency] ?? "").trim() && rate === null) {
          nextFxErrors[currency] = "Provide a valid USD rate.";
        }

        if (amount !== null && amount !== 0 && !draft.USD.trim() && rate === null) {
          nextFxErrors[currency] = "USD amount is required — enter an exchange rate here or fill the USD field directly.";
        }
      } catch (fxError) {
        nextFxErrors[currency] = (fxError as Error).message;
      }
    }

    setErrors(validationErrors);
    setFxErrors(nextFxErrors);

    if (
      Object.keys(validationErrors).length > 0 ||
      Object.keys(nextFxErrors).length > 0 ||
      !config
    ) {
      return;
    }

    setIsSaving(true);

    try {
      auth.touchSession();

      const normalizedDraft: ExpenseDraft = {
        ...draft,
        Date: draft.Date.trim(),
        USD: draft.USD.trim().replace(",", "."),
        Category: draft.Category.trim(),
        spentBy: draft.spentBy.trim(),
        Comment: draft.Comment.trim(),
        currencyAmounts: Object.fromEntries(
          Object.entries(draft.currencyAmounts).map(([k, v]) => [k, v.trim().replace(",", ".")]),
        ),
        customFields: Object.fromEntries(
          Object.entries(draft.customFields).map(([k, v]) => [k, v.trim()]),
        ),
      };

      if (!normalizedDraft.USD.trim()) {
        const nonUsdValues = parseNonUsdValues(normalizedDraft, activeCurrencies);
        const parsedRates = currencyService.parseManualFxRates(manualFxRates, activeCurrencies);
        const usdValue =
          nonUsdValues !== null
            ? currencyService.convertToUsdFromRates(nonUsdValues, parsedRates, activeCurrencies)
            : 0;
        normalizedDraft.USD = usdValue ? usdValue.toFixed(2) : "";
      }

      if (isEditMode && editRowNumber !== null) {
        const updatedRecord = await googleSheetsService.updateExpenseRow(
          editRowNumber,
          expenseDraftToRowValues(normalizedDraft, activeCurrencies, customColumns, detectedDateFormat?.toSheet),
          buildFxBackupPayload(normalizedDraft, manualFxRates, activeCurrencies),
        );
        const submittedCurrency = getPreferredCurrency(normalizedDraft, activeCurrencies);
        dataset.updateInDataset(updatedRecord);
        navigate(editOrigin, {
          state: { editResult: { rowNumber: editRowNumber, saved: true } },
          replace: true,
        });
        trackEvent("expense_edited", { currency: submittedCurrency ?? "USD" });
        return;
      } else {
        // Detect whether the submitted date is earlier than the last record in the sheet.
        // When the sheet has a date-order issue we skip the overlay (append fallback will be used).
        const lastRecord = dataset.snapshot?.records.at(-1);
        const lastDateIso = lastRecord
          ? (detectedDateFormat?.toIso(lastRecord.Date) ?? lastRecord.Date)
          : null;
        const isPastDateEntry =
          lastDateIso !== null &&
          normalizedDraft.Date < lastDateIso &&
          !dataset.snapshot?.dateOrderIssueRows?.length;
        if (isPastDateEntry) setIsInsertingHistorical(true);

        const { record: addedRecord, insertMode } = await googleSheetsService.appendExpenseRow(
          expenseDraftToRowValues(normalizedDraft, activeCurrencies, customColumns, detectedDateFormat?.toSheet),
          buildFxBackupPayload(normalizedDraft, manualFxRates, activeCurrencies),
        );
        if (insertMode) {
          await dataset.reloadDataset();
        } else {
          dataset.appendToDataset(addedRecord);
        }
      }

      const submittedCurrency = getPreferredCurrency(normalizedDraft, activeCurrencies);

      setDraft(createInitialDraft(auth.session?.givenName ?? auth.session?.email ?? "", activeCurrencies, customColumns));

      // Preserve current FX rates
      const keptRates: ManualFxRates = {};
      for (const code of activeCurrencies) {
        keptRates[code] = manualFxRates[code] ?? "";
      }
      setManualFxRates(keptRates);
      setActiveNonUsdCurrency(submittedCurrency);
      setHasManuallySelectedCurrency(true);
      setErrors({});
      setFxErrors({});
      setSuccess("Expense saved successfully.");
      amountInputRef.current?.focus();
      trackEvent("expense_added", { currency: submittedCurrency ?? "USD" });
      if (pendingSaveMode.current === 'close') {
        trackEvent("expense_added_close", { currency: submittedCurrency ?? "USD" });
        navigate('/home', { state: { expenseSaved: true } });
        return;
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsInsertingHistorical(false);
      setIsSaving(false);
    }
  };

  const selectedExpenseDate = useMemo(() => {
    const parsedDate = new Date(`${draft.Date}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }, [draft.Date]);

  const exactDateLabel = useMemo(
    () =>
      selectedExpenseDate.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }),
    [selectedExpenseDate],
  );

  return (
    <Layout title={isEditMode ? "Edit Expense" : "Add Expense"} onBack={isEditMode ? handleEditBack : undefined}>
      {isInsertingHistorical ? (
        <div className="add-insert-overlay" role="status" aria-live="polite">
          <LoadingBlock label="Recording an entry with an earlier date. This may take a moment while the history is being updated…" />
        </div>
      ) : null}
      {success ? <StatusBanner variant="success" message={success} /> : null}
      {error ? <StatusBanner variant="error" message={error} /> : null}

      <form onSubmit={(event) => void onSubmit(event)}>
        {/* Amount — show non-USD input only when currencies are configured */}
        {activeNonUsdCurrency ? (
          <div className="add-amount-field">
            <input
              ref={amountInputRef}
              className="add-amount-input"
              inputMode="decimal"
              value={draft.currencyAmounts[activeNonUsdCurrency] ?? ""}
              onChange={(event) => updateCurrencyAmount(activeNonUsdCurrency, event.target.value)}
              placeholder="0.00"
              aria-label={`Amount in ${activeNonUsdCurrency}`}
            />
            {errors[activeNonUsdCurrency] ? (
              <div className="field-error">{errors[activeNonUsdCurrency]}</div>
            ) : null}
          </div>
        ) : (
          <div className="add-amount-field">
            <input
              ref={amountInputRef}
              className="add-amount-input"
              inputMode="decimal"
              value={draft.USD}
              onChange={(event) => updateDraft("USD", event.target.value)}
              placeholder="0.00"
              aria-label="Amount in USD"
            />
            {errors.USD ? (
              <div className="field-error">{errors.USD}</div>
            ) : null}
          </div>
        )}

        {/* Currency pills — only when visible currencies exist */}
        {visibleCurrencies.length > 0 ? (
          <div className="currency-pills" role="tablist" aria-label="Select currency">
            {visibleCurrencies.map((currency) => (
              <button
                key={currency}
                className={`currency-pill${currency === activeNonUsdCurrency ? " active" : ""}`}
                onClick={() => selectNonUsdCurrency(currency)}
                role="tab"
                type="button"
                aria-selected={currency === activeNonUsdCurrency}
                title={currencyNameMap.get(currency) ?? currency}
              >
                {currency}
              </button>
            ))}
            <div
              className={`currency-pill${!activeNonUsdCurrency ? " active" : ""}`}
              style={{ opacity: 0.6 }}
              title="US Dollar"
            >
              USD
            </div>
          </div>
        ) : null}

        {/* FX Rate row — for active non-USD currency */}
        {activeNonUsdCurrency && (manualFxRates[activeNonUsdCurrency] || draft.currencyAmounts[activeNonUsdCurrency]) ? (
          <div className="add-fx-row">
            <span className="add-fx-label">Rate</span>
            <input
              className="input add-fx-input"
              inputMode="decimal"
              value={manualFxRates[activeNonUsdCurrency] ?? ""}
              onChange={(event) => updateFxRate(activeNonUsdCurrency, event.target.value)}
              placeholder={`USD rate for ${activeNonUsdCurrency}`}
            />
          </div>
        ) : null}
        {activeNonUsdCurrency && (manualFxRates[activeNonUsdCurrency] || draft.currencyAmounts[activeNonUsdCurrency]) ? (
          <div className="input-group">
            <label className="input-label" htmlFor="usd-amount">USD</label>
            <input
              id="usd-amount"
              className="input"
              inputMode="decimal"
              value={draft.USD}
              onChange={(event) => updateDraft("USD", event.target.value)}
              placeholder="0.00"
            />
            {errors.USD ? <div className="field-error">{errors.USD}</div> : null}
          </div>
        ) : null}
        {activeNonUsdCurrency && fxErrors[activeNonUsdCurrency] ? (
          <div className="field-error mb-4">{fxErrors[activeNonUsdCurrency]}</div>
        ) : null}

        {/* Category */}
        <div className="input-group">
          <label className="input-label" htmlFor="category-field">Category</label>
          {suggestionLists.Category.length > 0 ? (
            <div className="category-chips">
              {suggestionLists.Category.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`category-chip${draft.Category === cat ? " active" : ""}`}
                  onClick={() => updateDraft("Category", cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          ) : null}
          <input
            id="category-field"
            className="input"
            list="category-options"
            value={draft.Category}
            onChange={(event) => updateDraft("Category", event.target.value)}
            placeholder="Or type a new category…"
            required
          />
          <datalist id="category-options">
            {suggestionLists.Category.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {errors.Category ? <div className="field-error">{errors.Category}</div> : null}
        </div>

        {/* Date */}
        <div className="input-group">
          <label className="input-label" htmlFor="expense-date-field">
            Date <span className="add-date-label-muted">({exactDateLabel})</span>
          </label>
          <div className="add-date-picker-row">
            <Calendar size={16} aria-hidden />
            <DatePicker
              id="expense-date-field"
              className="input add-date-picker-input"
              selected={selectedExpenseDate}
              onChange={(date: Date | null) => {
                if (!date) {
                  return;
                }
                updateDraft("Date", formatLocalDate(date));
              }}
              dateFormat="yyyy-MM-dd"
              popperPlacement="bottom-start"
              showPopperArrow={false}
              required
              aria-label="Expense date"
            />
          </div>
          {errors.Date ? <div className="field-error">{errors.Date}</div> : null}
        </div>

        {/* SpentBy */}
        <div className="input-group">
          <label className="input-label" htmlFor="spent-by-field">Spent By</label>
          <input
            id="spent-by-field"
            className="input"
            list="spent-by-options"
            value={draft.spentBy}
            onChange={(event) => updateDraft("spentBy", event.target.value)}
            required
          />
          <datalist id="spent-by-options">
            {(suggestionLists.spentBy ?? []).map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {errors.spentBy ? <div className="field-error">{errors.spentBy}</div> : null}
        </div>

        {/* Comment */}
        {!isCommentHidden ? (
        <div className="input-group">
          <label className="input-label" htmlFor="comment-field">Comment</label>
          <AutosuggestInput
            id="comment-field"
            value={draft.Comment}
            onChange={(value) => updateDraft("Comment", value)}
            allSuggestions={commentSuggestions}
            minChars={3}
            placeholder="Add a note…"
          />
        </div>
        ) : null}

        {/* Custom columns */}
        {visibleCustomColumns.map((col) => (
          <div key={col} className="input-group">
            <label className="input-label" htmlFor={`custom-field-${col}`}>{formatColumnLabel(col)}</label>
            <input
              id={`custom-field-${col}`}
              className="input"
              list={`custom-field-options-${col}`}
              value={draft.customFields[col] ?? ""}
              onChange={(event) => updateCustomField(col, event.target.value)}
            />
            <datalist id={`custom-field-options-${col}`}>
              {(suggestionLists.customFields?.[col] ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
        ))}

        {/* Spacer for sticky button */}
        <div style={{ height: 72 }} />
      </form>

      {/* Sticky Save Button */}
      <div className="add-sticky-save">
        {success ? (
          <div className="btn btn-primary add-saved-feedback">
            <Check size={20} aria-hidden />
            Saved!
          </div>
        ) : isViewOnly ? (
          <button
            className="btn btn-primary"
            type="button"
            aria-disabled="true"
            onClick={() => {
              const form = document.querySelector<HTMLFormElement>("form");
              form?.reportValidity();
              alert("You don't have permission for this action. Contact the setup owner to request access.");
            }}
          >
            Save Expense
          </button>
        ) : isEditMode ? (
          <button
            className="btn btn-primary"
            disabled={isSaving}
            type="button"
            onClick={() => {
              document.querySelector<HTMLFormElement>("form")?.requestSubmit();
            }}
          >
            {isSaving ? (
              <>
                <span className="spinner spinner-sm spinner-inverse" aria-hidden />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        ) : (
          <div className="add-sticky-save-pair">
            <button
              className="btn btn-primary"
              disabled={isSaving}
              type="button"
              onClick={() => {
                pendingSaveMode.current = 'continue';
                document.querySelector<HTMLFormElement>("form")?.requestSubmit();
              }}
            >
              {isSaving && pendingSaveMode.current === 'continue' ? (
                <>
                  <span className="spinner spinner-sm spinner-inverse" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <RotateCcw size={18} aria-hidden />
                  Save & Continue
                </>
              )}
            </button>
            <button
              className="btn btn-primary"
              disabled={isSaving}
              type="button"
              onClick={() => {
                pendingSaveMode.current = 'close';
                document.querySelector<HTMLFormElement>("form")?.requestSubmit();
              }}
            >
              {isSaving && pendingSaveMode.current === 'close' ? (
                <>
                  <span className="spinner spinner-sm spinner-inverse" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <House size={18} aria-hidden />
                  Save & Close
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {dataset.status === "loading" ? (
        <LoadingBlock label="Loading suggestions…" />
      ) : null}
      {isLoadingFxBackup ? <LoadingBlock label="Loading saved FX rates…" /> : null}
    </Layout>
  );
}
