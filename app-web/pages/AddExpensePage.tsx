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
import { formatLocalDate, getTodayLocalDate, detectDateFormat, normalizeDateToIso } from "../utils/date";
import { buildCommentSuggestions, expenseDraftToRowValues } from "../utils/spreadsheet";
import { findDuplicateExpenses } from "../utils/expenseTable";
import { parseOptionalDecimal, parsePositiveDecimal, validateExpenseDraft } from "../utils/validation";
import { AutosuggestInput } from "../components/AutosuggestInput";
import { ExpenseCard } from "../components/ExpenseTable";
import { trackEvent } from "../services/analytics";

function formatColumnLabel(name: string): string {
  return name.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
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
    spentFor: defaultEmail,
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
    spentFor: record.spentFor,
    Comment: record.Comment,
    currencyAmounts,
    customFields,
  };
}

function deriveInitialFxRates(record: ExpenseRecord, currencies: string[]): ManualFxRates {
  const rates: ManualFxRates = {};
  const usdValue = Number.parseFloat(record.USD);
  for (const code of currencies) {
    const amount = Number.parseFloat(record.currencyAmounts[code] ?? "");
    if (!Number.isNaN(usdValue) && usdValue !== 0 && !Number.isNaN(amount) && amount !== 0) {
      rates[code] = (Math.abs(amount) / Math.abs(usdValue)).toFixed(2);
    } else {
      rates[code] = "";
    }
  }
  return rates;
}

function deriveFxRateFromAmountPair(usdValue: string, nonUsdValue: string): string {
  const usd = Number.parseFloat(usdValue);
  const amount = Number.parseFloat(nonUsdValue);
  if (!Number.isFinite(usd) || usd === 0 || !Number.isFinite(amount) || amount === 0) {
    return "";
  }
  return (Math.abs(amount) / Math.abs(usd)).toFixed(2);
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
  const { config, isConfigLoading } = useConfig();
  const dataset = useDataset();
  const navigate = useNavigate();
  const { rowNumber: rowNumberParam } = useParams<{ rowNumber?: string }>();
  const location = useLocation();

  const isEditMode = !!rowNumberParam;
  const editRowNumber = rowNumberParam ? Number.parseInt(rowNumberParam, 10) : null;
  const editState = (location.state as {
    record?: ExpenseRecord;
    origin?: string;
    repeatRecord?: ExpenseRecord;
    prefillDate?: string;
    returnTo?: string;
    returnDate?: string;
  } | null);
  const editRecord = editState?.record ?? null;
  const editOrigin = editState?.origin ?? "/history";
  const repeatRecord = editState?.repeatRecord ?? null;
  const prefillDate = editState?.prefillDate ?? null;
  const returnTo = editState?.returnTo ?? "/home";

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
  const isSpentByHidden = hiddenColumns.includes("Spent By");
  const isSpentForHidden = hiddenColumns.includes("Spent For");
  const visibleCustomColumns = useMemo(
    () => customColumns.filter((c) => !hiddenColumns.includes(c)),
    [customColumns, hiddenColumns],
  );

  const detectedDateFormat = useMemo(
    () => detectDateFormat(dataset.snapshot?.records.map((r) => r.Date) ?? []),
    [dataset.snapshot],
  );

  const [draft, setDraft] = useState<ExpenseDraft>(() => {
    const baseDraft = createInitialDraft(auth.session?.givenName ?? auth.session?.email ?? "", activeCurrencies, customColumns);
    const normalizedPrefillDate = prefillDate ? detectedDateFormat?.toIso(prefillDate) ?? prefillDate : null;
    return normalizedPrefillDate ? { ...baseDraft, Date: normalizedPrefillDate } : baseDraft;
  });

  const handleAddBack = useCallback(() => {
    navigate(returnTo, { state: { returnDate: draft.Date }, replace: true });
  }, [draft.Date, navigate, returnTo]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<ExpenseRecord[]>([]);
  const [isInsertingHistorical, setIsInsertingHistorical] = useState(false);
  const [isLoadingFxBackup, setIsLoadingFxBackup] = useState(false);
  const [manualFxRates, setManualFxRates] = useState<ManualFxRates>(
    createEmptyFxRates(activeCurrencies),
  );
  const [fxErrors, setFxErrors] = useState<Partial<Record<string, string>>>({});
  const [liveFxRates, setLiveFxRates] = useState<Partial<Record<string, number>>>({});
  const [isFetchingLiveRates, setIsFetchingLiveRates] = useState(false);
  const [activeNonUsdCurrency, setActiveNonUsdCurrency] = useState<string | null>(
    visibleCurrencies[0] ?? null,
  );
  const normalizedDraftDate = useMemo(
    () => detectedDateFormat?.toIso(draft.Date) ?? normalizeDateToIso(draft.Date),
    [detectedDateFormat, draft.Date],
  );
  const [hasManuallySelectedCurrency, setHasManuallySelectedCurrency] = useState(false);
  const [currencyDictionary, setCurrencyDictionary] = useState<CurrencyDictionary | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const pendingSaveMode = useRef<'continue' | 'close'>('continue');
  const hasFetchedLiveRates = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const pendingNormalizedDraft = useRef<ExpenseDraft | null>(null);

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

  // Pre-fill draft from the edit record once on mount; normalise the sheet date to ISO.
  // Add mode: the useState initialiser already sets a blank draft with today's ISO date.
  // Both modes init once — background config changes no longer reset in-progress input.
  useEffect(() => {
    if (isEditMode && editRecord) {
      const normalizedDate = detectedDateFormat?.toIso(editRecord.Date) ?? editRecord.Date;
      const normalizedRecord = { ...editRecord, Date: normalizedDate };
      const nextDraft = createDraftFromRecord(normalizedRecord, activeCurrencies, customColumns);
      const nextRates = deriveInitialFxRates(normalizedRecord, activeCurrencies);
      setDraft(nextDraft);
      setManualFxRates((current) => ({
        ...createEmptyFxRates(activeCurrencies),
        ...current,
        ...nextRates,
      }));
      setActiveNonUsdCurrency(getPreferredCurrency(normalizedRecord, visibleCurrencies));
      setHasManuallySelectedCurrency(true);
    } else if (repeatRecord) {
      setDraft(createDraftFromRecord({ ...repeatRecord, Date: getTodayLocalDate() }, activeCurrencies, customColumns));
      setActiveNonUsdCurrency(getPreferredCurrency(repeatRecord, visibleCurrencies));
      setHasManuallySelectedCurrency(true);
    }
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

    if (prefillDate) {
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

  // Fetch live FX rates for the selected form date. This covers both today and
  // historical Add flows without the dead code path that tried to average same-day expenses.
  useEffect(() => {
    if (isEditMode || visibleCurrencies.length === 0 || !normalizedDraftDate) return;
    if (hasFetchedLiveRates.current === normalizedDraftDate) return;

    hasFetchedLiveRates.current = normalizedDraftDate;
    let isActive = true;
    setIsFetchingLiveRates(true);

    void currencyService
      .fetchLiveRates(visibleCurrencies, normalizedDraftDate)
      .then((rates) => {
        if (!isActive) return;
        setLiveFxRates(rates);
        setManualFxRates((current) => {
          const next = { ...current };
          for (const code of visibleCurrencies) {
            const value = rates[code];
            next[code] = value !== undefined ? value.toFixed(2) : current[code] ?? "";
          }
          return next;
        });
      })
      .finally(() => { if (isActive) setIsFetchingLiveRates(false); });

    return () => { isActive = false; };
  }, [isEditMode, normalizedDraftDate, visibleCurrencies]);
  const draftCurrencyDeps = activeCurrencies.map((c) => draft.currencyAmounts[c]).join("|");
  useEffect(() => {
    if (!isEditMode || activeCurrencies.length === 0) return;

    const nextRates = { ...manualFxRates };
    let changed = false;

    for (const code of activeCurrencies) {
      const currentRate = nextRates[code] ?? "";
      const currentRateValue = Number.parseFloat(currentRate);
      const hasUsableRate = currentRate.trim() !== "" && Number.isFinite(currentRateValue) && currentRateValue !== 0;
      if (hasUsableRate) continue;

      const usdValue = draft.USD.trim();
      const nonUsdValue = (draft.currencyAmounts[code] ?? "").trim();
      const derivedRate = deriveFxRateFromAmountPair(usdValue, nonUsdValue);
      if (!derivedRate) continue;

      nextRates[code] = derivedRate;
      changed = true;
    }

    if (changed) {
      setManualFxRates(nextRates);
    }
  }, [draft.USD, draftCurrencyDeps, activeCurrencies, isEditMode, manualFxRates]);

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

  if (isViewOnly) {
    return <Navigate to="/home" replace />;
  }

  if (!config && !isConfigLoading) {
    return <Navigate to="/setup" replace />;
  }

  if (isEditMode && !editRecord) {
    return <Navigate to="/history" replace />;
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

  const executeSave = async (normalizedDraft: ExpenseDraft): Promise<void> => {
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      auth.touchSession();

      if (isEditMode && editRowNumber !== null) {
        const { record, moveMode } = await googleSheetsService.updateExpenseRow(
          editRowNumber,
          expenseDraftToRowValues(normalizedDraft, activeCurrencies, customColumns, detectedDateFormat?.toSheet),
          buildFxBackupPayload(normalizedDraft, manualFxRates, activeCurrencies),
        );
        const submittedCurrency = getPreferredCurrency(normalizedDraft, activeCurrencies);
        if (moveMode) {
          setIsInsertingHistorical(true);
          await dataset.reloadDataset();
        } else {
          dataset.updateInDataset(record);
        }
        navigate(editOrigin, {
          state: { editResult: { rowNumber: record.rowNumber, saved: true } },
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

      setDraft((currentDraft) => {
        const clearedAmounts: Record<string, string> = {};
        for (const code of activeCurrencies) clearedAmounts[code] = "";
        return { ...currentDraft, USD: "", currencyAmounts: clearedAmounts };
      });

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
        navigate(returnTo, {
          state: { returnDate: normalizedDraft.Date, expenseSaved: true },
          replace: true,
        });
        return;
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsInsertingHistorical(false);
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleCancelDuplicate = (): void => {
    pendingNormalizedDraft.current = null;
    setDuplicateMatches([]);
  };

  const handleConfirmSave = async (): Promise<void> => {
    const pending = pendingNormalizedDraft.current;
    if (!pending) return;
    pendingNormalizedDraft.current = null;
    setDuplicateMatches([]);
    await executeSave(pending);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isSavingRef.current) return;

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

    if (Object.keys(validationErrors).length > 0 || Object.keys(nextFxErrors).length > 0) {
      // Defer to the next tick so inputs re-render with data-invalid before we query the DOM.
      setTimeout(() => {
        const firstInvalid = document.querySelector<HTMLElement>('form [data-invalid="true"]');
        if (!firstInvalid) return;
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusTarget =
          firstInvalid instanceof HTMLInputElement ||
          firstInvalid instanceof HTMLTextAreaElement ||
          firstInvalid instanceof HTMLSelectElement
            ? firstInvalid
            : firstInvalid.querySelector<HTMLElement>("input, textarea, select");
        focusTarget?.focus();
      }, 0);
      return;
    }

    if (!config) {
      return;
    }

    const normalizedDraft: ExpenseDraft = {
      ...draft,
      Date: draft.Date.trim(),
      USD: draft.USD.trim().replace(",", "."),
      Category: draft.Category.trim(),
      spentBy: draft.spentBy.trim(),
      spentFor: draft.spentFor.trim(),
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

    if (!isEditMode) {
      // Draft dates are ISO ("2026-06-30"); snapshot record dates are in the sheet's
      // locale format ("6/30/2026"). Convert before comparing.
      const [y, m, d] = normalizedDraft.Date.split("-").map(Number);
      const draftDateForSheet =
        y && m && d && detectedDateFormat
          ? detectedDateFormat.toSheet(new Date(y, m - 1, d))
          : normalizedDraft.Date;
      const dupes = findDuplicateExpenses(
        { ...normalizedDraft, Date: draftDateForSheet },
        dataset.snapshot?.records ?? [],
        activeCurrencies,
      );
      if (dupes.length > 0) {
        pendingNormalizedDraft.current = normalizedDraft;
        setDuplicateMatches(dupes);
        return;
      }
    }

    await executeSave(normalizedDraft);
  };

  const selectedExpenseDate = useMemo(() => {
    const parsedDate = new Date(`${draft.Date}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }, [draft.Date]);

  return (
    <Layout title={isEditMode ? "Edit Expense" : "Add Expense"} onBack={isEditMode ? handleEditBack : (!prefillDate ? undefined : handleAddBack)}>
      {isInsertingHistorical ? (
        <div className="add-insert-overlay" role="status" aria-live="polite">
          <LoadingBlock label="Recording an entry with an earlier date. This may take a moment while the history is being updated…" />
        </div>
      ) : null}
      {success ? <StatusBanner variant="success" message={success} /> : null}
      {error ? <StatusBanner variant="error" message={error} toast /> : null}

      <form onSubmit={(event) => void onSubmit(event)}>
        {/* Date + Amount — Date sits compact beside the hero Amount input */}
        <div className="add-date-amount-row">
          <div className="add-date-compact-group">
            <div className="add-date-picker-row" data-invalid={errors.Date ? "true" : undefined}>
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

          {activeNonUsdCurrency ? (
            <div className="add-amount-field add-amount-field--inline">
              <input
                id="amount-field"
                ref={amountInputRef}
                className="add-amount-input"
                inputMode="decimal"
                value={draft.currencyAmounts[activeNonUsdCurrency] ?? ""}
                onChange={(event) => updateCurrencyAmount(activeNonUsdCurrency, event.target.value)}
                placeholder="0.00"
                aria-label={`Amount in ${activeNonUsdCurrency}`}
                data-invalid={errors[activeNonUsdCurrency] || errors.USD ? "true" : undefined}
              />
              {errors[activeNonUsdCurrency] ? (
                <div className="field-error">{errors[activeNonUsdCurrency]}</div>
              ) : null}
            </div>
          ) : (
            <div className="add-amount-field add-amount-field--inline">
              <input
                id="amount-field"
                ref={amountInputRef}
                className="add-amount-input"
                inputMode="decimal"
                value={draft.USD}
                onChange={(event) => updateDraft("USD", event.target.value)}
                placeholder="0.00"
                aria-label="Amount in USD"
                data-invalid={errors.USD ? "true" : undefined}
              />
              {errors.USD ? (
                <div className="field-error">{errors.USD}</div>
              ) : null}
            </div>
          )}
        </div>

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

        {/* FX Conversion Card — for active non-USD currency */}
        {activeNonUsdCurrency && (
          manualFxRates[activeNonUsdCurrency] ||
          prefillDate ||
          draft.currencyAmounts[activeNonUsdCurrency] ||
          liveFxRates[activeNonUsdCurrency] !== undefined ||
          isFetchingLiveRates
        ) ? (
          <div className="add-fx-card">
            <div className="add-fx-card-body">
              <div className="add-fx-card-col">
                <span className="add-fx-col-label">{activeNonUsdCurrency}/USD</span>
                <input
                  className="add-fx-card-rate-input"
                  inputMode="decimal"
                  value={manualFxRates[activeNonUsdCurrency] ?? ""}
                  onChange={(event) => updateFxRate(activeNonUsdCurrency, event.target.value)}
                  placeholder="0.00"
                  aria-label={`Exchange rate: ${activeNonUsdCurrency} per 1 USD`}
                  data-invalid={fxErrors[activeNonUsdCurrency] ? "true" : undefined}
                />
              </div>
              <div className="add-fx-card-col--live">
                {draft.Date === getTodayLocalDate() ? (
                  isFetchingLiveRates ? (
                    <button type="button" className="add-fx-card-live-btn" disabled>
                      <span className="add-fx-card-live-btn-tag">Live rate</span>
                      <span className="add-fx-card-live-btn-val">…</span>
                    </button>
                  ) : liveFxRates[activeNonUsdCurrency] !== undefined ? (
                    <button
                      type="button"
                      className="add-fx-card-live-btn"
                      onClick={() => updateFxRate(activeNonUsdCurrency, liveFxRates[activeNonUsdCurrency]!.toFixed(2))}
                    >
                      <span className="add-fx-card-live-btn-tag">Live rate</span>
                      <span className="add-fx-card-live-btn-val">{liveFxRates[activeNonUsdCurrency]!.toFixed(2)}</span>
                    </button>
                  ) : null
                ) : null}
              </div>
              <div className="add-fx-card-col">
                <span className="add-fx-col-label">USD</span>
                <div className="add-fx-card-result-value">{draft.USD || "0.00"}</div>
              </div>
            </div>
            {fxErrors[activeNonUsdCurrency] ? (
              <div className="field-error" style={{ padding: "0 var(--space-4) var(--space-3)" }}>
                {fxErrors[activeNonUsdCurrency]}
              </div>
            ) : null}
            {errors.USD ? (
              <div className="field-error" style={{ padding: "0 var(--space-4) var(--space-3)" }}>
                {errors.USD}
              </div>
            ) : null}
          </div>
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
          <AutosuggestInput
            id="category-field"
            value={draft.Category}
            onChange={(v) => updateDraft("Category", v)}
            allSuggestions={suggestionLists.Category}
            minChars={1}
            placeholder="Or type a new category…"
            clearable
            showChevron
            required
            invalid={!!errors.Category}
          />
          {errors.Category ? <div className="field-error">{errors.Category}</div> : null}
        </div>

        {/* Spent By + Spent For */}
        {(!isSpentByHidden || !isSpentForHidden) ? (
        <div className="two-col-row">
          {!isSpentByHidden ? (
          <div className="input-group">
            <label className="input-label" htmlFor="spent-by-field">Spent By</label>
            <AutosuggestInput
              id="spent-by-field"
              value={draft.spentBy}
              onChange={(v) => updateDraft("spentBy", v)}
              allSuggestions={suggestionLists.spentBy ?? []}
              minChars={1}
              clearable
              showChevron
              required
              invalid={!!errors.spentBy}
            />
            {errors.spentBy ? <div className="field-error">{errors.spentBy}</div> : null}
          </div>
          ) : null}

          {!isSpentForHidden ? (
          <div className="input-group">
            <label className="input-label" htmlFor="spent-for-field">Spent For</label>
            <AutosuggestInput
              id="spent-for-field"
              value={draft.spentFor}
              onChange={(v) => updateDraft("spentFor", v)}
              allSuggestions={suggestionLists.spentFor ?? []}
              minChars={1}
              clearable
              showChevron
              required
              invalid={!!errors.spentFor}
            />
            {errors.spentFor ? <div className="field-error">{errors.spentFor}</div> : null}
          </div>
          ) : null}
        </div>
        ) : null}

        {/* Comment */}
        <div className="input-group">
          <label className="input-label" htmlFor="comment-field">Comment</label>
          <AutosuggestInput
            id="comment-field"
            value={draft.Comment}
            onChange={(value) => updateDraft("Comment", value)}
            allSuggestions={commentSuggestions}
            minChars={2}
            placeholder="Add a note…"
            multiLine
          />
        </div>

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

      {duplicateMatches.length > 0 ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dup-dialog-title"
          onKeyDown={(e) => { if (e.key === 'Escape') handleCancelDuplicate(); }}
        >
          <div className="confirm-dialog confirm-wide">
            <p className="confirm-title" id="dup-dialog-title">Possible duplicate</p>
            <p className="confirm-warning">
              {duplicateMatches.length === 1
                ? 'A similar expense already exists on this date.'
                : `${duplicateMatches.length} similar expenses already exist on this date.`}{' '}
              Save anyway?
            </p>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              {duplicateMatches.map((record) => (
                <ExpenseCard
                  key={record.rowNumber}
                  record={record}
                  sheetCurrencies={activeCurrencies}
                  customColumns={customColumns}
                />
              ))}
            </div>
            <div className="confirm-actions">
              <button
                className="btn btn-secondary btn-inline"
                type="button"
                autoFocus
                onClick={handleCancelDuplicate}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-inline"
                type="button"
                onClick={() => { void handleConfirmSave(); }}
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
