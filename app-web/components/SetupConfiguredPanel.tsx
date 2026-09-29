import { StatusBanner } from "./StatusBanner";
import { SetupReportList } from "./SetupReportList";
import { GuestUnlinkBanner } from "./GuestUnlinkBanner";
import { ConnectedSheetCard } from "./ConnectedSheetCard";
import { SheetStructureCard } from "./SheetStructureCard";
import { ColumnMappingSection } from "./ColumnMappingSection";
import { SharingSection } from "./SharingSection";
import { useConfig } from "../contexts/ConfigContext";
import { useSheetStructure } from "../hooks/useSheetStructure";
import { useColumnMapping } from "../hooks/useColumnMapping";
import { useSetupSharing } from "../hooks/useSetupSharing";
import { SetupReport } from "../types/expense";

interface SetupConfiguredPanelProps {
  success: string | null;
  setupReport: SetupReport | null;
  onChangeSheet: () => void;
  onFixConfig: () => void;
}

export function SetupConfiguredPanel({ success, setupReport, onChangeSheet, onFixConfig }: SetupConfiguredPanelProps): JSX.Element {
  const { config } = useConfig();
  const isGuest = config?.isGuest ?? false;
  const structure = useSheetStructure();
  const mapping = useColumnMapping(true, config?.spreadsheetId);
  const sharing = useSetupSharing(!isGuest);

  return (
    <>
      {isGuest && config?.ownerEmail ? <GuestUnlinkBanner ownerEmail={config.ownerEmail} /> : null}

      {success ? <StatusBanner variant="success" message={success} /> : null}
      {setupReport ? <SetupReportList report={setupReport} /> : null}

      {config ? (
        <ConnectedSheetCard config={config} onChangeSheet={onChangeSheet} onFixConfig={onFixConfig} />
      ) : null}

      <SheetStructureCard structure={structure} isGuest={isGuest}>
        <ColumnMappingSection mapping={mapping} />
      </SheetStructureCard>

      {!isGuest ? <SharingSection sharing={sharing} /> : null}
    </>
  );
}
