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
  isLoadingHistory: boolean;
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    categories: [],
    comment: "",
  });
  const retryBackoffRef = useRef(new RetryBackoff());

  // Refs that shadow state — allow loadDataset to read latest values without
  // being recreated every time snapshot or isInvalidated changes.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const isInvalidatedRef = useRef(isInvalidated);
  isInvalidatedRef.current = isInvalidated;
  const configRef = useRef(config);
  configRef.current = config;

  // Stable ref to auth.touchSession so loadDataset doesn't depend on auth identity.
  const touchSessionRef = useRef(auth.touchSession);
  touchSessionRef.current = auth.touchSession;

  // In-flight promise: concurrent callers join the active load instead of starting a new one.
  const inFlightRef = useRef<Promise<DatasetSnapshot> | null>(null);

  // Generation counter: incremented on every new load. Phase-2 callbacks check this
  // before writing to state so stale results from cancelled loads are discarded.
  const loadGenerationRef = useRef(0);

  const loadDataset = useCallback(
    async (force = false): Promise<DatasetSnapshot> => {
      if (!configRef.current) {
        const configError = new Error("Spreadsheet is not configured.");
        setStatus("error");
        setError(configError.message);
        throw configError;
      }

      // Return cached snapshot when valid and no reload is requested.
      if (!force && snapshotRef.current && !isInvalidatedRef.current) {
        return snapshotRef.current;
      }

      // Join an in-flight load rather than starting a duplicate request.
      if (!force && inFlightRef.current) {
        return inFlightRef.current;
      }

      // On forced reload, discard any stale in-flight promise.
      if (force) {
        inFlightRef.current = null;
      }

      if (!retryBackoffRef.current.canRetryNow()) {
        const err = new Error("Retrying... please wait.");
        setStatus("error");
        setError(err.message);
        throw err;
      }

      setStatus("loading");
      setError(null);

      const generation = ++loadGenerationRef.current;

      const promise = (async (): Promise<DatasetSnapshot> => {
        try {
          touchSessionRef.current();
          const loaded = await googleSheetsService.loadExpenses();
          const customColumnNames = configRef.current?.customColumns ?? [];
          const nextSnapshot: DatasetSnapshot = {
            records: loaded.records,
            distinctValues: buildDistinctValues(loaded.records, customColumnNames),
            loadedAt: Date.now(),
            payloadBytes: loaded.payloadBytes,
            loadPhase: loaded.loadPhase,
          };

          setSnapshot(nextSnapshot);
          snapshotRef.current = nextSnapshot;
          setIsInvalidated(false);
          isInvalidatedRef.current = false;
          setStatus("ready");
          retryBackoffRef.current.reset();

          // Phase 2: load historical records in the background when only recent data was returned.
          if (loaded.loadPhase === "recent") {
            setIsLoadingHistory(true);
            googleSheetsService
              .loadExpenseHistory(loaded.startRow - 1)
              .then((history) => {
                if (loadGenerationRef.current !== generation) return; // stale — discard
                setSnapshot((prev) => {
                  if (!prev) return prev;
                  const records = [...history.records, ...prev.records];
                  const customCols = configRef.current?.customColumns ?? [];
                  return {
                    ...prev,
                    records,
                    distinctValues: buildDistinctValues(records, customCols),
                    payloadBytes: prev.payloadBytes + history.payloadBytes,
                    loadPhase: "full",
                  };
                });
              })
              .catch((err) => {
                console.warn("[DatasetContext] history load failed:", (err as Error).message);
              })
              .finally(() => {
                if (loadGenerationRef.current === generation) setIsLoadingHistory(false);
              });
          }

          return nextSnapshot;
        } catch (loadError) {
          setStatus("error");
          retryBackoffRef.current.recordFailure();
          const message = (loadError as Error).message;
          setError(message);
          console.error("[DatasetContext] loadDataset error:", message);
          throw loadError;
        } finally {
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = promise;
      return promise;
    },
    [config], // only recreate when the spreadsheet config changes
  );

  const reloadDataset = useCallback(async (): Promise<DatasetSnapshot> => {
    retryBackoffRef.current.reset();
    inFlightRef.current = null;
    setSnapshot(null);
    snapshotRef.current = null;
    setIsInvalidated(false);
    isInvalidatedRef.current = false;
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
      isLoadingHistory,
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
    [clearError, distinctValues, error, isLoadingHistory, invalidateDataset, appendToDataset, updateInDataset, removeLastFromDataset, loadDataset, reloadDataset, searchFilters, snapshot, status],
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
