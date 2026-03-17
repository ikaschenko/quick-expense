import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { googleSheetsService } from "../services/googleSheets";
import { SpreadsheetConfig } from "../types/expense";
import { useAuth } from "./AuthContext";

interface ConfigContextValue {
  config: SpreadsheetConfig | null;
  saveConfig: (config: SpreadsheetConfig) => void;
  clearConfig: () => void;
  refreshConfig: () => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: PropsWithChildren): JSX.Element {
  const { session } = useAuth();
  const [config, setConfig] = useState<SpreadsheetConfig | null>(null);

  useEffect(() => {
    if (!session) {
      setConfig(null);
      return;
    }

    void googleSheetsService
      .getConfig()
      .then((nextConfig) => setConfig(nextConfig))
      .catch(() => setConfig(null));
  }, [session]);

  const value = useMemo<ConfigContextValue>(() => {
    return {
      config,
      saveConfig: (nextConfig) => {
        setConfig(nextConfig);
      },
      clearConfig: () => {
        void googleSheetsService.clearConfig().finally(() => setConfig(null));
      },
      refreshConfig: () => {
        if (!session) {
          setConfig(null);
          return;
        }

        void googleSheetsService
          .getConfig()
          .then((nextConfig) => setConfig(nextConfig))
          .catch(() => setConfig(null));
      },
    };
  }, [config, session]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within ConfigProvider.");
  }

  return context;
}
