import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { googleSheetsService } from "../services/googleSheets";
import { metricsCache } from "../services/metricsCache";
import { RetryBackoff } from "../services/retryBackoff";
import { AppError, SetupDefaults, SpreadsheetConfig } from "../types/expense";
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
  defaults: SetupDefaults | null;
  defaultsError: string | null;
  defaultsConflict: boolean;
  isDefaultsLoading: boolean;
  isDefaultsSaving: boolean;
  loadDefaults: () => Promise<SetupDefaults | null>;
  saveDefault: (field: string, value: string | null) => Promise<void>;
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
  const defaultsScope = session && config ? `${session.email}|${config.email}|${config.spreadsheetId}` : null;
  const scopeRef = useRef(defaultsScope);
  const scopeGeneration = useRef(0);
  const defaultsRef = useRef<{ scope: string; snapshot: SetupDefaults } | null>(null);
  const [defaultsState, setDefaultsState] = useState<typeof defaultsRef.current>(null);
  const [defaultsErrorState, setDefaultsErrorState] = useState<{ scope: string; message: string } | null>(null);
  const [loadingScope, setLoadingScope] = useState<string | null>(null);
  const [savingScope, setSavingScope] = useState<string | null>(null);
  const savingRef = useRef<string | null>(null);
  const conflictRef = useRef<string | null>(null);
  const [conflictScope, setConflictScope] = useState<string | null>(null);
  const pendingDefaults = useRef<{ scope: string; promise: Promise<SetupDefaults | null> } | null>(null);
  if (scopeRef.current !== defaultsScope) {
    scopeRef.current = defaultsScope;
    scopeGeneration.current += 1;
    defaultsRef.current = null;
    pendingDefaults.current = null;
    conflictRef.current = null;
    savingRef.current = null;
  }
  useEffect(() => {
    setDefaultsState(null);
    setDefaultsErrorState(null);
    setConflictScope(null);
    setLoadingScope(null);
    setSavingScope(null);
  }, [defaultsScope]);
  const defaults = defaultsState?.scope === defaultsScope ? defaultsState.snapshot : null;
  const defaultsError = defaultsErrorState?.scope === defaultsScope ? defaultsErrorState.message : null;
  const defaultsConflict = !!defaultsScope && conflictScope === defaultsScope;

  const loadDefaults = useCallback((): Promise<SetupDefaults | null> => {
    const scope = defaultsScope;
    if (!scope || conflictRef.current === scope) return Promise.resolve(null);
    const generation = scopeGeneration.current;
    if (pendingDefaults.current?.scope === scope) return pendingDefaults.current.promise;
    const cached = defaultsRef.current?.scope === scope ? defaultsRef.current.snapshot : null;
    setLoadingScope(scope);
    const promise = googleSheetsService.getDefaults(cached?.version)
      .then((response) => {
        if (scopeRef.current !== scope || scopeGeneration.current !== generation) return null;
        const snapshot = "unchanged" in response ? cached : response;
        if (!snapshot) throw new Error("Defaults could not be loaded. Reload the page to try again.");
        const newest = defaultsRef.current?.scope === scope ? defaultsRef.current.snapshot : null;
        if (newest && BigInt(newest.version) > BigInt(snapshot.version)) return newest;
        defaultsRef.current = { scope, snapshot };
        setDefaultsState(defaultsRef.current);
        setDefaultsErrorState(null);
        return snapshot;
      })
      .catch((error: unknown) => {
        if (scopeRef.current === scope && scopeGeneration.current === generation) {
          setDefaultsErrorState({ scope, message: "Defaults could not be loaded. You can enter this expense manually." });
          if (error instanceof AppError && error.code === "DEFAULTS_CONFLICT") {
            conflictRef.current = scope;
            setConflictScope(scope);
          }
        }
        return null;
      })
      .finally(() => {
        if (pendingDefaults.current?.promise === promise) pendingDefaults.current = null;
        if (scopeRef.current === scope && scopeGeneration.current === generation) setLoadingScope(null);
      });
    pendingDefaults.current = { scope, promise };
    return promise;
  }, [defaultsScope]);

  const saveDefault = useCallback(async (field: string, nextValue: string | null): Promise<void> => {
    const scope = defaultsScope;
    const current = defaultsRef.current;
    const generation = scopeGeneration.current;
    if (!scope || current?.scope !== scope || conflictRef.current === scope || savingRef.current === scope) {
      throw new Error("Reload the page before changing defaults.");
    }
    savingRef.current = scope;
    setSavingScope(scope);
    try {
      const snapshot = await googleSheetsService.saveDefault(field, nextValue, current.snapshot.version);
      if (scopeRef.current !== scope || scopeGeneration.current !== generation) return;
      defaultsRef.current = { scope, snapshot };
      setDefaultsState(defaultsRef.current);
      setDefaultsErrorState(null);
    } catch (error) {
      if (scopeRef.current === scope && scopeGeneration.current === generation) {
        if (error instanceof AppError && error.code === "DEFAULTS_CONFLICT") {
          conflictRef.current = scope;
          setConflictScope(scope);
        }
        setDefaultsErrorState({ scope, message: (error as Error).message });
      }
      throw error;
    } finally {
      if (scopeGeneration.current === generation && savingRef.current === scope) savingRef.current = null;
      if (scopeRef.current === scope && scopeGeneration.current === generation) setSavingScope(null);
    }
  }, [defaultsScope]);

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
    // Only session identity (email) matters here — re-running on every session mutation
    // (e.g. touchSession() bumping lastActivityAt) would re-fetch config needlessly and
    // flash the whole dashboard back to its loading skeleton on unrelated actions.
  }, [session?.email]);

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
      defaults,
      defaultsError,
      defaultsConflict,
      isDefaultsLoading: !!defaultsScope && loadingScope === defaultsScope,
      isDefaultsSaving: !!defaultsScope && savingScope === defaultsScope,
      loadDefaults,
      saveDefault,
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
  }, [config, isFetching, fetchedForEmail, error, fileName, isFileNameLoading, session, defaults, defaultsError, defaultsConflict, defaultsScope, loadingScope, savingScope, loadDefaults, saveDefault]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within ConfigProvider.");
  }

  return context;
}
