import { AppActivityTracker } from "../components/AppActivityTracker";
import { Layout } from "../components/Layout";
import { SetupPathChooser } from "../components/SetupPathChooser";
import { SetupFreshPanel } from "../components/SetupFreshPanel";
import { SetupExistingPanel } from "../components/SetupExistingPanel";
import { SetupConfiguredPanel } from "../components/SetupConfiguredPanel";
import { DisplayPreferencesCard } from "../components/DisplayPreferencesCard";
import { useConfig } from "../contexts/ConfigContext";
import { SetupPath, useSetupPath } from "../hooks/useSetupPath";
import { useSpreadsheetSetup } from "../hooks/useSpreadsheetSetup";
import { trackEvent } from "../services/analytics";

import type { JSX } from "react";

const PAGE_TITLES: Record<SetupPath, string> = {
  choose: "Set up Quick Expense",
  fresh: "Create your spreadsheet",
  existing: "Connect existing sheet",
  configured: "Setup",
};

export function SetupPage(): JSX.Element {
  const { isConfigLoading, error: configError } = useConfig();
  const [setupPath, setSetupPath] = useSetupPath();
  const setup = useSpreadsheetSetup();

  const goToChoose = (): void => {
    setup.resetBanners();
    setSetupPath("choose");
  };

  const choosePath = (path: "fresh" | "existing"): void => {
    trackEvent("setup_path_selected", { method: path === "fresh" ? "new_sheet" : "existing_sheet" });
    setSetupPath(path);
  };

  return (
    <Layout title={PAGE_TITLES[setupPath]}>
      <AppActivityTracker />
      {setupPath === "choose" ? (
        <SetupPathChooser isConfigLoading={isConfigLoading} configError={configError} onChoose={choosePath} />
      ) : null}

      {setupPath === "fresh" ? <SetupFreshPanel setup={setup} onBack={goToChoose} /> : null}

      {setupPath === "existing" ? <SetupExistingPanel setup={setup} onBack={goToChoose} /> : null}

      {setupPath === "configured" ? (
        <SetupConfiguredPanel
          success={setup.success}
          setupReport={setup.setupReport}
          onChangeSheet={() => setSetupPath("choose")}
          onFixConfig={() => setSetupPath("existing")}
        />
      ) : null}

      <DisplayPreferencesCard />
    </Layout>
  );
}
