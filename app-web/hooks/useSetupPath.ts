import { useEffect, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";

export type SetupPath = "choose" | "fresh" | "existing" | "configured";

export function useSetupPath(): [SetupPath, (path: SetupPath) => void] {
  const { config, isConfigLoading } = useConfig();
  const [setupPath, setSetupPath] = useState<SetupPath>(() => (config ? "configured" : "choose"));

  useEffect(() => {
    if (isConfigLoading) return;
    if (config) {
      setSetupPath("configured");
    } else {
      setSetupPath((prev) => (prev === "configured" ? "choose" : prev));
    }
  }, [config, isConfigLoading]);

  return [setupPath, setSetupPath];
}
