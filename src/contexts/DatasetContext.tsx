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
import { DatasetSnapshot, DistinctValues, SearchFilters } from "../types/expense";
import { buildDistinctValues } from "../utils/spreadsheet";
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
  clearError: () => void;
  distinctValues: DistinctValues;
}

const emptyDistinctValues: DistinctValues = {
  Category: [],
  WhoSpent: [],
  ForWhom: [],
  PaymentChannel: [],
  Theme: [],
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
        const nextSnapshot: DatasetSnapshot = {
          records: loaded.records,
          distinctValues: buildDistinctValues(loaded.records),
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

  const clearError = useCallback(() => setError(null), []);

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
      clearError,
      distinctValues: snapshot?.distinctValues ?? emptyDistinctValues,
    }),
    [clearError, error, invalidateDataset, loadDataset, reloadDataset, searchFilters, snapshot, status],
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
