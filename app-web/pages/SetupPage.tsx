import { AppActivityTracker } from "../components/AppActivityTracker";
import { Layout } from "../components/Layout";
import { SetupPathChooser } from "../components/SetupPathChooser";
import { SetupFreshPanel } from "../components/SetupFreshPanel";
import { SetupExistingPanel } from "../components/SetupExistingPanel";
import { SetupConfiguredPanel } from "../components/SetupConfiguredPanel";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useDataset } from "../contexts/DatasetContext";
import { SetupPath, useSetupPath } from "../hooks/useSetupPath";
import { useSpreadsheetSetup } from "../hooks/useSpreadsheetSetup";
import { useOnboardingTour } from "../hooks/useOnboardingTour";
import { trackEvent } from "../services/analytics";
import { tourVariantFromOrigin } from "../utils/onboardingTour";

import { useEffect, useRef, type JSX } from "react";

// Lets the configured panel finish laying out before the tour measures its targets.
const AUTO_TOUR_DELAY_MS = 400;

const PAGE_TITLES: Record<SetupPath, string> = {
  choose: "Set up Quick Expense",
  fresh: "Create your spreadsheet",
  existing: "Connect existing sheet",
  configured: "Setup",
};

export function SetupPage(): JSX.Element {
  const { config, isConfigLoading, error: configError } = useConfig();
  const { session } = useAuth();
  const dataset = useDataset();
  const [setupPath, setSetupPath] = useSetupPath();
  const setup = useSpreadsheetSetup();
  const tour = useOnboardingTour();
  const autoTourStartedRef = useRef(false);
  const isOwner = !!config && !config.isGuest;

  const completedPath = setup.completedPath;
  const datasetStatus = dataset.status;
  const hasExpenses = (dataset.snapshot?.records.length ?? 0) > 0;
  useEffect(() => {
    if (autoTourStartedRef.current || !completedPath || setupPath !== "configured") return;
    if (!isOwner || !session || session.onboardingTourSeen) return;
    // The existing-sheet ending depends on whether the sheet already has expenses.
    if (completedPath === "existing_sheet" && (datasetStatus === "idle" || datasetStatus === "loading")) {
      if (datasetStatus === "idle") dataset.loadDataset().catch(() => {/* surfaced via dataset.error */});
      return;
    }
    const timer = window.setTimeout(() => {
      autoTourStartedRef.current = true;
      tour.start({ variant: completedPath, trigger: "auto", hasExpenses });
    }, AUTO_TOUR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [completedPath, setupPath, isOwner, session, datasetStatus, hasExpenses, dataset.loadDataset, tour.start]);

  const replayTour = (): void => {
    tour.start({ variant: tourVariantFromOrigin(config?.connectionOrigin), trigger: "replay", hasExpenses });
  };

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
          onStartTour={isOwner ? replayTour : undefined}
        />
      ) : null}
    </Layout>
  );
}
