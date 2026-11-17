import { useEffect } from "react";
import { Compass, RotateCcw } from "lucide-react";
import { StatusBanner } from "./StatusBanner";
import { SetupReportList } from "./SetupReportList";
import { GuestUnlinkBanner } from "./GuestUnlinkBanner";
import { ConnectedSheetCard } from "./ConnectedSheetCard";
import { SheetStructureCard } from "./SheetStructureCard";
import { ColumnMappingSection } from "./ColumnMappingSection";
import { SharingSection } from "./SharingSection";
import { DisplayPreferencesCard } from "./DisplayPreferencesCard";
import { useConfig } from "../contexts/ConfigContext";
import { useSheetStructure } from "../hooks/useSheetStructure";
import { useColumnMapping } from "../hooks/useColumnMapping";
import { useSetupSharing } from "../hooks/useSetupSharing";
import { SetupReport } from "../types/expense";

import type { JSX } from "react";

interface SetupConfiguredPanelProps {
  success: string | null;
  setupReport: SetupReport | null;
  onChangeSheet: () => void;
  onFixConfig: () => void;
  /** Owner-only: replays the onboarding tour. */
  onStartTour?: () => void;
}

export function SetupConfiguredPanel({ success, setupReport, onChangeSheet, onFixConfig, onStartTour }: SetupConfiguredPanelProps): JSX.Element {
  const { config, loadDefaults, defaultsError, defaultsConflict } = useConfig();
  const isGuest = config?.isGuest ?? false;
  const structure = useSheetStructure();
  const mapping = useColumnMapping(true, config?.spreadsheetId);
  const sharing = useSetupSharing(!isGuest);

  useEffect(() => { void loadDefaults(); }, [loadDefaults]);

  return (
    <>
      {isGuest && config?.ownerEmail ? <GuestUnlinkBanner ownerEmail={config.ownerEmail} /> : null}

      {success ? <StatusBanner variant="success" message={success} /> : null}
      {setupReport ? <SetupReportList report={setupReport} /> : null}
      {defaultsError ? (
        <div className="field-default-notice">
          <StatusBanner variant="error" message={defaultsConflict ? "Defaults changed. Reload the page before changing defaults again." : "Defaults could not be loaded or updated. Reload the page to try again."} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}><RotateCcw size={16} aria-hidden />Reload page</button>
        </div>
      ) : null}

      {config ? (
        <ConnectedSheetCard config={config} onChangeSheet={onChangeSheet} onFixConfig={onFixConfig} />
      ) : null}

      {onStartTour && !isGuest ? (
        <button type="button" className="btn btn-ghost btn-sm qe-tour-replay" onClick={onStartTour}>
          <Compass size={16} aria-hidden />
          Take a quick tour
        </button>
      ) : null}

      <SheetStructureCard structure={structure} isGuest={isGuest}>
        <ColumnMappingSection mapping={mapping} />
      </SheetStructureCard>

      {!isGuest ? <SharingSection sharing={sharing} /> : null}

      <DisplayPreferencesCard />
    </>
  );
}
