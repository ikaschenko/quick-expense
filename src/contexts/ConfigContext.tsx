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
import { RetryBackoff } from "../services/retryBackoff";
import { SpreadsheetConfig } from "../types/expense";
import { useAuth } from "./AuthContext";

interface ConfigContextValue {
  config: SpreadsheetConfig | null;
  isConfigLoading: boolean;
  error: string | null;
  saveConfig: (config: SpreadsheetConfig) => void;
  clearConfig: () => void;
  clearError: () => void;
  refreshConfig: () => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: PropsWithChildren): JSX.Element {
  const { session } = useAuth();
  const [config, setConfig] = useState<SpreadsheetConfig | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryBackoffRef = useRef(new RetryBackoff());

  useEffect(() => {
    if (!session) {
      setIsConfigLoading(false);
      setConfig(null);
      setError(null);
      retryBackoffRef.current.reset();
      return;
    }

    // Only load if retry backoff allows it
    if (!retryBackoffRef.current.canRetryNow()) {
      setIsConfigLoading(false);
      return;
    }

    setIsConfigLoading(true);
    setError(null);
    void googleSheetsService
      .getConfig()
      .then((nextConfig) => {
        setConfig(nextConfig);
        retryBackoffRef.current.reset(); // Clear retry backoff on success
      })
      .catch((err) => {
        setConfig(null);
        retryBackoffRef.current.recordFailure(); // Increment backoff on failure
        const message = (err as Error).message;
        setError(message);
        console.error("[ConfigContext] getConfig failed:", message);
      })
      .finally(() => setIsConfigLoading(false));
  }, [session]);

  const value = useMemo<ConfigContextValue>(() => {
    return {
      config,
      isConfigLoading,
      error,
      saveConfig: (nextConfig) => {
        setConfig(nextConfig);
        retryBackoffRef.current.reset();
      },
      clearConfig: () => {
        void googleSheetsService.clearConfig().finally(() => {
          setConfig(null);
          retryBackoffRef.current.reset();
        });
      },
      clearError: () => {
        setError(null);
      },
      refreshConfig: () => {
        if (!session) {
          setIsConfigLoading(false);
          setConfig(null);
          setError(null);
          return;
        }

        retryBackoffRef.current.reset(); // Reset backoff on manual refresh
        setIsConfigLoading(true);
        setError(null);
        void googleSheetsService
          .getConfig()
          .then((nextConfig) => setConfig(nextConfig))
          .catch((err) => {
            setConfig(null);
            const message = (err as Error).message;
            setError(message);
            console.error("[ConfigContext] refreshConfig failed:", message);
          })
          .finally(() => setIsConfigLoading(false));
      },
    };
  }, [config, isConfigLoading, error, session]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within ConfigProvider.");
  }

  return context;
}
