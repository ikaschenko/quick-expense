import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Check, Calendar } from "lucide-react";
import DatePicker from "react-datepicker";
import { Layout } from "../components/Layout";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBanner } from "../components/StatusBanner";
import { NON_USD_CURRENCIES } from "../constants/expenses";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";
import { currencyService } from "../services/currency";
import { googleSheetsService } from "../services/googleSheets";
import {
  ExpenseDraft,
  FxRateBackupPayload,
  ManualFxRates,
  NonUsdCurrencyCode,
} from "../types/expense";
import { formatLocalDate, getTodayLocalDate } from "../utils/date";
import { expenseDraftToRowValues } from "../utils/spreadsheet";
import { parseOptionalDecimal, parsePositiveDecimal, validateExpenseDraft } from "../utils/validation";
import { trackEvent } from "../services/analytics";

function createInitialDraft(defaultEmail: string): ExpenseDraft {
  return {
    Date: getTodayLocalDate(),
    PLN: "",
    BYN: "",
    EUR: "",
    USD: "",
    Category: "",
    WhoSpent: defaultEmail,
    ForWhom: "",
    Comment: "",
    PaymentChannel: "",
    Theme: "",
  };
}

const emptyManualFxRates: ManualFxRates = {
  PLN: "",
  BYN: "",
  EUR: "",
};

function getPreferredNonUsdCurrency(
  expense: Pick<ExpenseDraft, NonUsdCurrencyCode> | null | undefined,
): NonUsdCurrencyCode {
  if (!expense) {
    return "PLN";
  }

  for (const currency of NON_USD_CURRENCIES) {
    if (expense[currency].trim()) {
      return currency;
    }
  }

  return "PLN";
}

function parseNonUsdValues(draft: ExpenseDraft): Partial<Record<"PLN" | "BYN" | "EUR", number>> | null {
  try {
    return {
      PLN: parseOptionalDecimal(draft.PLN) ?? undefined,
      BYN: parseOptionalDecimal(draft.BYN) ?? undefined,
      EUR: parseOptionalDecimal(draft.EUR) ?? undefined,
    };
  } catch {
    return null;
  }
}

function buildFxBackupPayload(draft: ExpenseDraft, rates: ManualFxRates): FxRateBackupPayload {
  return {
    expenseDate: draft.Date,
    rates: {
      PLN: rates.PLN.trim() || null,
      BYN: rates.BYN.trim() || null,
      EUR: rates.EUR.trim() || null,
    },
    amounts: {
      PLN: draft.PLN,
      BYN: draft.BYN,
      EUR: draft.EUR,
      USD: draft.USD,
    },
  };
}

export function AddExpensePage(): JSX.Element {
  const auth = useAuth();
  const { config } = useConfig();
  const dataset = useDataset();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ExpenseDraft>(createInitialDraft(auth.session?.email ?? ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFxBackup, setIsLoadingFxBackup] = useState(false);
  const [manualFxRates, setManualFxRates] = useState<ManualFxRates>(emptyManualFxRates);
  const [fxErrors, setFxErrors] = useState<Partial<Record<NonUsdCurrencyCode, string>>>({});
  const [activeNonUsdCurrency, setActiveNonUsdCurrency] = useState<NonUsdCurrencyCode>("PLN");
  const [hasManuallySelectedCurrency, setHasManuallySelectedCurrency] = useState(false);

  const latestSavedNonUsdCurrency = useMemo(() => {
    const records = dataset.snapshot?.records;
    const latestRecord = records && records.length > 0 ? records[records.length - 1] : null;
    return getPreferredNonUsdCurrency(latestRecord);
  }, [dataset.snapshot]);

  useEffect(() => {
    setDraft(createInitialDraft(auth.session?.email ?? ""));
    setManualFxRates(emptyManualFxRates);
    setFxErrors({});
    setActiveNonUsdCurrency("PLN");
    setHasManuallySelectedCurrency(false);
  }, [auth.session?.email]);

  useEffect(() => {
    if (hasManuallySelectedCurrency || !dataset.snapshot) {
      return;
    }

    setActiveNonUsdCurrency(latestSavedNonUsdCurrency);
  }, [dataset.snapshot, hasManuallySelectedCurrency, latestSavedNonUsdCurrency]);

  useEffect(() => {
    if (!config) {
      return;
    }

    if (!dataset.snapshot && dataset.status !== "loading") {
      void dataset.loadDataset().catch(() => undefined);
    }
  }, [config, dataset]);

  useEffect(() => {
    if (!config) {
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

        setManualFxRates({
          PLN: backup.rates.PLN ?? "",
          BYN: backup.rates.BYN ?? "",
          EUR: backup.rates.EUR ?? "",
        });
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
  }, [config?.spreadsheetId]);

  useEffect(() => {
    const nonUsdValues = parseNonUsdValues(draft);
    if (!nonUsdValues) {
      return;
    }

    const hasNonUsdValue = Object.values(nonUsdValues).some((value) => value !== undefined);
    if (!hasNonUsdValue) {
      return;
    }

    try {
      const parsedRates = currencyService.parseManualFxRates(manualFxRates);
      const rateValidationErrors: Partial<Record<NonUsdCurrencyCode, string>> = {};
      let allRatesPresent = true;

      (["PLN", "BYN", "EUR"] as NonUsdCurrencyCode[]).forEach((currency) => {
        if (nonUsdValues[currency] !== undefined && !parsedRates[currency]) {
          allRatesPresent = false;
        }
      });

      if (!allRatesPresent) {
        return;
      }

      setFxErrors(rateValidationErrors);
      const usdValue = currencyService.convertToUsdFromRates(nonUsdValues, parsedRates);
      const nextUsd = usdValue ? usdValue.toFixed(2) : "";
      setDraft((currentDraft) =>
        currentDraft.USD === nextUsd
          ? currentDraft
          : {
              ...currentDraft,
              USD: nextUsd,
            },
      );
    } catch {
      // Keep the current USD value until manual FX inputs are corrected.
    }
  }, [draft.PLN, draft.BYN, draft.EUR, manualFxRates]);

  const suggestionLists = useMemo(() => dataset.distinctValues, [dataset.distinctValues]);

  if (!config) {
    return <Navigate to="/setup" replace />;
  }

  const updateDraft = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]): void => {
    if (success) {
      setSuccess(null);
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }));
  };

  const updateFxRate = (currency: NonUsdCurrencyCode, value: string): void => {
    if (success) {
      setSuccess(null);
    }

    setManualFxRates((currentRates) => ({
      ...currentRates,
      [currency]: value,
    }));
  };

  const selectNonUsdCurrency = (currency: NonUsdCurrencyCode): void => {
    if (success) {
      setSuccess(null);
    }

    setHasManuallySelectedCurrency(true);
    setActiveNonUsdCurrency(currency);
    setDraft((currentDraft) => {
      const nextDraft = { ...currentDraft };

      NON_USD_CURRENCIES.forEach((candidate) => {
        if (candidate !== currency) {
          nextDraft[candidate] = "";
        }
      });

      return nextDraft;
    });
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };

      NON_USD_CURRENCIES.forEach((candidate) => {
        if (candidate !== currency) {
          delete nextErrors[candidate];
        }
      });

      return nextErrors;
    });
    setFxErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };

      NON_USD_CURRENCIES.forEach((candidate) => {
        if (candidate !== currency) {
          delete nextErrors[candidate];
        }
      });

      return nextErrors;
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    setSuccess(null);
    setError(null);

    const validationErrors = validateExpenseDraft(draft);
    const nextFxErrors: Partial<Record<NonUsdCurrencyCode, string>> = {};

    (["PLN", "BYN", "EUR"] as NonUsdCurrencyCode[]).forEach((currency) => {
      try {
        const amount = parseOptionalDecimal(draft[currency]);
        const rate = parsePositiveDecimal(manualFxRates[currency]);

        if (manualFxRates[currency].trim() && rate === null) {
          nextFxErrors[currency] = "Provide a valid USD rate.";
        }

        if (amount !== null && amount !== 0 && !draft.USD.trim() && rate === null) {
          nextFxErrors[currency] = "Enter a USD rate here or fill USD manually.";
        }
      } catch (fxError) {
        nextFxErrors[currency] = (fxError as Error).message;
      }
    });

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
        Category: draft.Category.trim(),
        WhoSpent: draft.WhoSpent.trim(),
        ForWhom: draft.ForWhom.trim(),
        Comment: draft.Comment.trim(),
        PaymentChannel: draft.PaymentChannel.trim(),
        Theme: draft.Theme.trim(),
      };

      if (!normalizedDraft.USD.trim()) {
        const nonUsdValues = parseNonUsdValues(normalizedDraft);
        const parsedRates = currencyService.parseManualFxRates(manualFxRates);
        const usdValue =
          nonUsdValues !== null ? currencyService.convertToUsdFromRates(nonUsdValues, parsedRates) : 0;

        normalizedDraft.USD = usdValue ? usdValue.toFixed(2) : "";
      }

      await googleSheetsService.appendExpenseRow(
        expenseDraftToRowValues(normalizedDraft),
        buildFxBackupPayload(normalizedDraft, manualFxRates),
      );

      const submittedNonUsdCurrency = getPreferredNonUsdCurrency(normalizedDraft);
      dataset.invalidateDataset();
      setDraft(createInitialDraft(auth.session?.email ?? ""));
      setManualFxRates({
        PLN: manualFxRates.PLN,
        BYN: manualFxRates.BYN,
        EUR: manualFxRates.EUR,
      });
      setActiveNonUsdCurrency(submittedNonUsdCurrency);
      setHasManuallySelectedCurrency(true);
      setErrors({});
      setFxErrors({});
      setSuccess("Expense saved successfully.");
      trackEvent("expense_added", { currency: submittedNonUsdCurrency });
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
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
    <Layout title="Add Expense">
      {success ? <StatusBanner variant="success" message={success} /> : null}
      {error ? <StatusBanner variant="error" message={error} /> : null}

      <form onSubmit={(event) => void onSubmit(event)}>
        {/* Amount */}
        <div className="add-amount-field">
          <input
            className="add-amount-input"
            inputMode="decimal"
            value={draft[activeNonUsdCurrency]}
            onChange={(event) => updateDraft(activeNonUsdCurrency, event.target.value)}
            placeholder="0.00"
            aria-label={`Amount in ${activeNonUsdCurrency}`}
          />
          {errors[activeNonUsdCurrency] ? (
            <div className="field-error">{errors[activeNonUsdCurrency]}</div>
          ) : null}
        </div>

        {/* Currency pills */}
        <div className="currency-pills" role="tablist" aria-label="Select currency">
          {NON_USD_CURRENCIES.map((currency) => (
            <button
              key={currency}
              className={`currency-pill${currency === activeNonUsdCurrency ? " active" : ""}`}
              onClick={() => selectNonUsdCurrency(currency)}
              role="tab"
              type="button"
              aria-selected={currency === activeNonUsdCurrency}
            >
              {currency}
            </button>
          ))}
          <div
            className={`currency-pill${activeNonUsdCurrency === ("USD" as never) ? " active" : ""}`}
            style={{ opacity: 0.6 }}
          >
            USD
          </div>
        </div>

        {/* FX Rate row */}
        {activeNonUsdCurrency !== "PLN" || manualFxRates[activeNonUsdCurrency] ? (
          <div className="add-fx-row">
            <span className="add-fx-label">Rate</span>
            <input
              className="input add-fx-input"
              inputMode="decimal"
              value={manualFxRates[activeNonUsdCurrency]}
              onChange={(event) => updateFxRate(activeNonUsdCurrency, event.target.value)}
              placeholder={`USD rate for ${activeNonUsdCurrency}`}
            />
          </div>
        ) : null}
        {manualFxRates[activeNonUsdCurrency] || draft[activeNonUsdCurrency] ? (
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
        {fxErrors[activeNonUsdCurrency] ? (
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

        {/* Who Spent / For Whom */}
        <div className="add-fields-row">
          <div className="input-group">
            <label className="input-label" htmlFor="who-spent-field">Who spent</label>
            <input
              id="who-spent-field"
              className="input"
              list="who-spent-options"
              value={draft.WhoSpent}
              onChange={(event) => updateDraft("WhoSpent", event.target.value)}
              required
            />
            <datalist id="who-spent-options">
              {suggestionLists.WhoSpent.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            {errors.WhoSpent ? <div className="field-error">{errors.WhoSpent}</div> : null}
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="for-whom-field">For whom</label>
            <input
              id="for-whom-field"
              className="input"
              list="for-whom-options"
              value={draft.ForWhom}
              onChange={(event) => updateDraft("ForWhom", event.target.value)}
            />
            <datalist id="for-whom-options">
              {suggestionLists.ForWhom.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Comment */}
        <div className="input-group">
          <label className="input-label" htmlFor="comment-field">Comment</label>
          <input
            id="comment-field"
            className="input"
            value={draft.Comment}
            onChange={(event) => updateDraft("Comment", event.target.value)}
            placeholder="Add a note…"
          />
        </div>

        {/* PaymentChannel */}
        <div className="input-group">
          <label className="input-label" htmlFor="payment-channel-field">Payment Channel</label>
          <input
            id="payment-channel-field"
            className="input"
            list="payment-channel-options"
            value={draft.PaymentChannel}
            onChange={(event) => updateDraft("PaymentChannel", event.target.value)}
          />
          <datalist id="payment-channel-options">
            {suggestionLists.PaymentChannel.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>

        {/* Theme */}
        <div className="input-group">
          <label className="input-label" htmlFor="theme-field">Theme</label>
          <input
            id="theme-field"
            className="input"
            list="theme-options"
            value={draft.Theme}
            onChange={(event) => updateDraft("Theme", event.target.value)}
          />
          <datalist id="theme-options">
            {suggestionLists.Theme.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>

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
        ) : (
          <button
            className="btn btn-primary"
            disabled={isSaving}
            type="submit"
            form=""
            onClick={(e) => {
              e.preventDefault();
              const form = document.querySelector<HTMLFormElement>("form");
              if (form) form.requestSubmit();
            }}
          >
            {isSaving ? (
              <>
                <span className="spinner spinner-sm spinner-inverse" aria-hidden />
                Saving…
              </>
            ) : (
              "Save Expense"
            )}
          </button>
        )}
      </div>

      {dataset.status === "loading" ? (
        <LoadingBlock label="Loading suggestions…" />
      ) : null}
      {isLoadingFxBackup ? <LoadingBlock label="Loading saved FX rates…" /> : null}
    </Layout>
  );
}
