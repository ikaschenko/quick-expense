import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
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
import { getTodayLocalDate } from "../utils/date";
import { expenseDraftToRowValues } from "../utils/spreadsheet";
import { parseOptionalDecimal, parsePositiveDecimal, validateExpenseDraft } from "../utils/validation";

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
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <section className="card">
        <div className="page-header">
          <div className="page-header-top">
            <h1>Add Expense</h1>
            <button className="secondary-button" onClick={() => navigate(-1)} type="button">
              Back
            </button>
          </div>
        </div>
        {success ? <StatusBanner variant="success" message={success} /> : null}
        {error ? <StatusBanner variant="error" message={error} /> : null}
        <form className="form-layout emphasized-field-labels" onSubmit={(event) => void onSubmit(event)}>
          <div className="field-grid">
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={draft.Date}
                onChange={(event) => updateDraft("Date", event.target.value)}
                required
              />
              {errors.Date ? <small className="field-error">{errors.Date}</small> : null}
            </label>
            <label className="field" key={activeNonUsdCurrency}>
              <span className="currency-picker" role="tablist" aria-label="Select non-USD currency">
                {NON_USD_CURRENCIES.map((currency, index) => (
                  <span className="currency-picker-item" key={currency}>
                    <button
                      className={
                        currency === activeNonUsdCurrency
                          ? "currency-picker-link active"
                          : "currency-picker-link"
                      }
                      onClick={() => selectNonUsdCurrency(currency)}
                      role="tab"
                      type="button"
                      aria-selected={currency === activeNonUsdCurrency}
                    >
                      {currency}
                    </button>
                    {index < NON_USD_CURRENCIES.length - 1 ? (
                      <span className="currency-picker-separator" aria-hidden="true">
                        |
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
              <input
                value={draft[activeNonUsdCurrency]}
                onChange={(event) => updateDraft(activeNonUsdCurrency, event.target.value)}
                placeholder="0.00"
              />
              {errors[activeNonUsdCurrency] ? (
                <small className="field-error">{errors[activeNonUsdCurrency]}</small>
              ) : null}
              <input
                className="fx-rate-input"
                value={manualFxRates[activeNonUsdCurrency]}
                onChange={(event) => updateFxRate(activeNonUsdCurrency, event.target.value)}
                placeholder={`USD rate for ${activeNonUsdCurrency}`}
              />
              {fxErrors[activeNonUsdCurrency] ? (
                <small className="field-error">{fxErrors[activeNonUsdCurrency]}</small>
              ) : (
                <small className="fx-rate-label">Manual USD rate</small>
              )}
            </label>
            <label className="field">
              <span>USD</span>
              <input
                value={draft.USD}
                onChange={(event) => updateDraft("USD", event.target.value)}
                placeholder="0.00"
              />
              {errors.USD ? <small className="field-error">{errors.USD}</small> : null}
            </label>
          </div>
          <label className="field">
            <span>Category</span>
            <input
              list="category-options"
              value={draft.Category}
              onChange={(event) => updateDraft("Category", event.target.value)}
              required
            />
            <datalist id="category-options">
              {suggestionLists.Category.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            {errors.Category ? <small className="field-error">{errors.Category}</small> : null}
          </label>
          <label className="field">
            <span>WhoSpent</span>
            <input
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
            {errors.WhoSpent ? <small className="field-error">{errors.WhoSpent}</small> : null}
          </label>
          <label className="field">
            <span>ForWhom</span>
            <input
              list="for-whom-options"
              value={draft.ForWhom}
              onChange={(event) => updateDraft("ForWhom", event.target.value)}
            />
            <datalist id="for-whom-options">
              {suggestionLists.ForWhom.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Comment</span>
            <textarea
              value={draft.Comment}
              onChange={(event) => updateDraft("Comment", event.target.value)}
              rows={3}
            />
          </label>
          <label className="field">
            <span>PaymentChannel</span>
            <input
              list="payment-channel-options"
              value={draft.PaymentChannel}
              onChange={(event) => updateDraft("PaymentChannel", event.target.value)}
            />
            <datalist id="payment-channel-options">
              {suggestionLists.PaymentChannel.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Theme</span>
            <input
              list="theme-options"
              value={draft.Theme}
              onChange={(event) => updateDraft("Theme", event.target.value)}
            />
            <datalist id="theme-options">
              {suggestionLists.Theme.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <div className="action-row">
            <div className="button-row">
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? (
                  <>
                    <span className="spinner button-spinner" aria-hidden="true" />
                    <span>Saving…</span>
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
            <div className="action-status">
              {isSaving ? (
                <StatusBanner variant="info" message="Saving expense to the backend. Please wait…" />
              ) : null}
              {success ? <StatusBanner variant="success" message={success} /> : null}
              {error ? <StatusBanner variant="error" message={error} /> : null}
            </div>
          </div>
        </form>
        {dataset.status === "loading" ? (
          <LoadingBlock label="Loading previous values for quick suggestions…" />
        ) : null}
        {isLoadingFxBackup ? <LoadingBlock label="Loading saved FX rates…" /> : null}
      </section>
    </Layout>
  );
}
