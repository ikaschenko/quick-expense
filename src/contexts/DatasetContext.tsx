import {
  useCallback,
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { googleSheetsService } from "../services/googleSheets";
import { RetryBackoff } from "../services/retryBackoff";
import { DatasetSnapshot, DistinctValues, ExpenseRecord, SearchFilters } from "../types/expense";
import { buildDistinctValues, mergeCategories } from "../utils/spreadsheet";
import { useAuth } from "./AuthContext";
import { useConfig } from "./ConfigContext";

type DatasetStatus = "idle" | "loading" | "ready" | "error";

interface DatasetContextValue {
  status: DatasetStatus;
  snapshot: DatasetSnapshot | null;
  error: string | null;
  searchFilters: SearchFilters;
  setSearchFilters: (filters: SearchFilters) => void;
  loadDataset: (force?: boolean) => Promise<DatasetSnapshot>;
  reloadDataset: () => Promise<DatasetSnapshot>;
  invalidateDataset: () => void;
  appendToDataset: (record: ExpenseRecord) => void;
  updateInDataset: (record: ExpenseRecord) => void;
  removeLastFromDataset: () => void;
  clearError: () => void;
  distinctValues: DistinctValues;
}

const emptyDistinctValues: DistinctValues = {
  Category: [],
  spentBy: [],
  customFields: {},
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetProvider({ children }: PropsWithChildren): JSX.Element {
  const { config } = useConfig();
  const auth = useAuth();
  const [status, setStatus] = useState<DatasetStatus>("idle");
  const [snapshot, setSnapshot] = useState<DatasetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInvalidated, setIsInvalidated] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    categories: [],
    comment: "",
  });
  const retryBackoffRef = useRef(new RetryBackoff());

  const loadDataset = useCallback(
    async (force = false): Promise<DatasetSnapshot> => {
      if (!config) {
        const configError = new Error("Spreadsheet is not configured.");
        setStatus("error");
        setError(configError.message);
        throw configError;
      }

      if (snapshot && !force && !isInvalidated) {
        return snapshot;
      }

      // Only proceed if retry backoff allows it
      if (!retryBackoffRef.current.canRetryNow()) {
        const err = new Error("Retrying... please wait.");
        setStatus("error");
        setError(err.message);
        throw err;
      }

      setStatus("loading");
      setError(null);

      try {
        auth.touchSession();
        const loaded = await googleSheetsService.loadExpenses();
        const customColumnNames = config.customColumns ?? [];
        const nextSnapshot: DatasetSnapshot = {
          records: loaded.records,
          distinctValues: buildDistinctValues(loaded.records, customColumnNames),
          loadedAt: Date.now(),
          payloadBytes: loaded.payloadBytes,
        };

        setSnapshot(nextSnapshot);
        setIsInvalidated(false);
        setStatus("ready");
        retryBackoffRef.current.reset(); // Clear backoff on success
        return nextSnapshot;
      } catch (loadError) {
        setStatus("error");
        retryBackoffRef.current.recordFailure(); // Increment backoff on failure
        const message = (loadError as Error).message;
        setError(message);
        console.error("[DatasetContext] loadDataset error:", message);
        throw loadError;
      }
    },
    [auth, config, isInvalidated, snapshot],
  );

  const reloadDataset = useCallback(async (): Promise<DatasetSnapshot> => {
    retryBackoffRef.current.reset(); // Clear backoff on manual reload
    setSnapshot(null);
    setIsInvalidated(false);
    return loadDataset(true);
  }, [loadDataset]);

  const invalidateDataset = useCallback(() => setIsInvalidated(true), []);

  const appendToDataset = useCallback(
    (record: ExpenseRecord): void => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const records = [...prev.records, record];
        const customColumnNames = config?.customColumns ?? [];
        return { ...prev, records, distinctValues: buildDistinctValues(records, customColumnNames) };
      });
    },
    [config],
  );

  const updateInDataset = useCallback(
    (record: ExpenseRecord): void => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const records = prev.records.map((r) => (r.rowNumber === record.rowNumber ? record : r));
        const customColumnNames = config?.customColumns ?? [];
        return { ...prev, records, distinctValues: buildDistinctValues(records, customColumnNames) };
      });
    },
    [config],
  );

  const removeLastFromDataset = useCallback((): void => {
    setSnapshot((prev) => {
      if (!prev || prev.records.length === 0) return prev;
      const records = prev.records.slice(0, -1);
      const customColumnNames = config?.customColumns ?? [];
      return { ...prev, records, distinctValues: buildDistinctValues(records, customColumnNames) };
    });
  }, [config]);

  const clearError = useCallback(() => setError(null), []);

  const distinctValues = useMemo(() => {
    const base = snapshot?.distinctValues ?? emptyDistinctValues;
    const predefined = config?.predefinedCategories ?? [];
    if (!predefined.length) return base;
    return { ...base, Category: mergeCategories(base.Category, predefined) };
  }, [snapshot?.distinctValues, config?.predefinedCategories]);

  const value = useMemo<DatasetContextValue>(
    () => ({
      status,
      snapshot,
      error,
      searchFilters,
      setSearchFilters,
      loadDataset,
      reloadDataset,
      invalidateDataset,
      appendToDataset,
      updateInDataset,
      removeLastFromDataset,
      clearError,
      distinctValues,
    }),
    [clearError, distinctValues, error, invalidateDataset, appendToDataset, updateInDataset, removeLastFromDataset, loadDataset, reloadDataset, searchFilters, snapshot, status],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset(): DatasetContextValue {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error("useDataset must be used within DatasetProvider.");
  }

  return context;
}
