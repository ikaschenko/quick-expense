import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { googleSheetsService } from "../services/googleSheets";
import { metricsCache } from "../services/metricsCache";
import { RetryBackoff } from "../services/retryBackoff";
import { SpreadsheetConfig } from "../types/expense";
import { useAuth } from "./AuthContext";

interface ConfigContextValue {
  config: SpreadsheetConfig | null;
  isConfigLoading: boolean;
  error: string | null;
  fileName: string | null;
  isFileNameLoading: boolean;
  saveConfig: (config: SpreadsheetConfig) => void;
  clearConfig: () => Promise<void>;
  clearError: () => void;
  refreshConfig: () => void;
  updateStructure: (currencies: string[], customColumns: string[]) => void;
  toggleColumnVisibility: (field: string, hidden: boolean) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: PropsWithChildren): JSX.Element {
  const { session } = useAuth();
  const [config, setConfig] = useState<SpreadsheetConfig | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  // Tracks the session email for which the last config fetch completed.
  // null means no fetch has completed yet (initial state or after logout).
  const [fetchedForEmail, setFetchedForEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived synchronously during render — true when a fetch is in progress OR when
  // the current session's config has not yet been fetched. Computing this in the render
  // phase (not an effect) prevents the effect-ordering race where a child page's
  // useEffect fires before ConfigContext's useEffect sets the loading flag.
  const isConfigLoading = isFetching || (!!session && session.email !== fetchedForEmail);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isFileNameLoading, setIsFileNameLoading] = useState(false);
  const retryBackoffRef = useRef(new RetryBackoff());

  useEffect(() => {
    if (!session) {
      setIsFetching(false);
      setFetchedForEmail(null);
      setConfig(null);
      setError(null);
      retryBackoffRef.current.reset();
      return;
    }

    // Only load if retry backoff allows it
    if (!retryBackoffRef.current.canRetryNow()) {
      setIsFetching(false);
      setFetchedForEmail(session.email); // settle so isConfigLoading stays false
      return;
    }

    const email = session.email;
    setIsFetching(true);
    setError(null);
    void googleSheetsService
      .getConfig()
      .then(({ config: nextConfig }) => {
        setConfig(nextConfig);
        retryBackoffRef.current.reset();
      })
      .catch((err) => {
        setConfig(null);
        retryBackoffRef.current.recordFailure();
        const message = (err as Error).message;
        setError(message);
        console.error("[ConfigContext] getConfig failed:", message);
      })
      .finally(() => {
        setIsFetching(false);
        setFetchedForEmail(email);
      });
  }, [session]);

  // Fetch the live file display name from Drive whenever the spreadsheet changes.
  useEffect(() => {
    if (!config?.spreadsheetId) {
      setFileName(null);
      setIsFileNameLoading(false);
      return;
    }
    setFileName(null);
    setIsFileNameLoading(true);
    void googleSheetsService
      .getSpreadsheetFileName()
      .then(({ fileName: name }) => setFileName(name))
      .catch(() => setFileName(null))
      .finally(() => setIsFileNameLoading(false));
  }, [config?.spreadsheetId]);

  const value = useMemo<ConfigContextValue>(() => {
    return {
      config,
      isConfigLoading,
      error,
      fileName,
      isFileNameLoading,
      saveConfig: (nextConfig) => {
        setConfig(nextConfig);
        retryBackoffRef.current.reset();
      },
      clearConfig: async () => {
        if (session?.isGuest) {
          throw new Error("Guests cannot unlink a shared config. Use the reset flow instead.");
        }
        await googleSheetsService.clearConfig();
        if (session?.email) metricsCache.clear(session.email);
        setConfig(null);
        retryBackoffRef.current.reset();
      },
      clearError: () => {
        setError(null);
      },
      refreshConfig: () => {
        if (!session) {
          setIsFetching(false);
          setFetchedForEmail(null);
          setConfig(null);
          setError(null);
          return;
        }

        const email = session.email;
        retryBackoffRef.current.reset(); // Reset backoff on manual refresh
        setIsFetching(true);
        setError(null);
        void googleSheetsService
          .getConfig()
          .then(({ config: nextConfig }) => {
            setConfig(nextConfig);
          })
          .catch((err) => {
            setConfig(null);
            const message = (err as Error).message;
            setError(message);
            console.error("[ConfigContext] refreshConfig failed:", message);
          })
          .finally(() => {
            setIsFetching(false);
            setFetchedForEmail(email);
          });
      },
      updateStructure: (currencies, customColumns) => {
        setConfig((prev) =>
          prev ? { ...prev, currencies, customColumns } : prev,
        );
      },
      toggleColumnVisibility: async (field: string, hidden: boolean): Promise<void> => {
        // Optimistic update
        setConfig((prev) => {
          if (!prev) return prev;
          const next = hidden
            ? [...prev.hiddenColumns, field]
            : prev.hiddenColumns.filter((f) => f !== field);
          return { ...prev, hiddenColumns: next };
        });
        try {
          const { hiddenColumns } = await googleSheetsService.toggleColumnVisibility(field, hidden);
          setConfig((prev) => (prev ? { ...prev, hiddenColumns } : prev));
        } catch (err) {
          // Revert optimistic update on failure
          setConfig((prev) => {
            if (!prev) return prev;
            const reverted = hidden
              ? prev.hiddenColumns.filter((f) => f !== field)
              : [...prev.hiddenColumns, field];
            return { ...prev, hiddenColumns: reverted };
          });
          throw err;
        }
      },
    };
  }, [config, isFetching, fetchedForEmail, error, fileName, isFileNameLoading, session]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within ConfigProvider.");
  }

  return context;
}
