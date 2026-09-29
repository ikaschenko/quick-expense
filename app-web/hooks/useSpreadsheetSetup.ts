import { useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import { googleSheetsService } from "../services/googleSheets";
import { openSpreadsheetPicker } from "../services/googlePicker";
import { trackEvent } from "../services/analytics";
import { AppError, HeaderDetails, SetupReport } from "../types/expense";

export interface SpreadsheetSetup {
  error: string | null;
  success: string | null;
  setupReport: SetupReport | null;
  headerDetails: HeaderDetails | null;
  templateCopyUrl: string | null;
  showMappingEditor: boolean;
  setShowMappingEditor: (open: boolean) => void;
  newSheetName: string;
  setNewSheetName: (name: string) => void;
  isSaving: boolean;
  isPicking: boolean;
  isCreating: boolean;
  busy: boolean;
  resetBanners: () => void;
  onPickFromDrive: () => Promise<void>;
  onCreateSpreadsheet: () => Promise<void>;
  /** Re-runs validation for the sheet picked in this session (used after a mapping save). */
  resaveCurrentSpreadsheet: () => Promise<void>;
}

export function useSpreadsheetSetup(): SpreadsheetSetup {
  const { saveConfig } = useConfig();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [setupReport, setSetupReport] = useState<SetupReport | null>(null);
  const [headerDetails, setHeaderDetails] = useState<HeaderDetails | null>(null);
  const [templateCopyUrl, setTemplateCopyUrl] = useState<string | null>(null);
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [newSheetName, setNewSheetName] = useState("Quick Expense — My Expenses");
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const resetBanners = (): void => {
    setError(null);
    setSuccess(null);
    setSetupReport(null);
    setHeaderDetails(null);
    setTemplateCopyUrl(null);
  };

  const saveSpreadsheet = async (url: string): Promise<void> => {
    setError(null);
    setHeaderDetails(null);
    setSuccess(null);
    setSetupReport(null);
    setIsSaving(true);

    try {
      const { config: nextConfig, setupReport: report } = await googleSheetsService.saveConfig(url);
      saveConfig(nextConfig);
      setSetupReport(report);
      setShowMappingEditor(false);
      setSuccess("Spreadsheet is configured and validated.");
      trackEvent("setup_saved");
    } catch (saveError) {
      setError((saveError as Error).message);
      if (saveError instanceof AppError && saveError.headerDetails) {
        setHeaderDetails(saveError.headerDetails);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const onPickFromDrive = async (): Promise<void> => {
    setError(null);
    setSuccess(null);
    setIsPicking(true);

    try {
      const { accessToken, apiKey, appId } = await googleSheetsService.getPickerConfig();
      const result = await openSpreadsheetPicker(accessToken, apiKey, appId);
      if (!result) return;

      setSpreadsheetUrl(result.spreadsheetUrl);
      await saveSpreadsheet(result.spreadsheetUrl);
    } catch (pickError) {
      setError((pickError as Error).message);
    } finally {
      setIsPicking(false);
    }
  };

  const onCreateSpreadsheet = async (): Promise<void> => {
    setError(null);
    setSuccess(null);
    setSetupReport(null);
    setTemplateCopyUrl(null);
    setIsCreating(true);
    try {
      const name = newSheetName.trim() || undefined;
      const { config: nextConfig, setupReport: report } = await googleSheetsService.createSpreadsheet(name);
      saveConfig(nextConfig);
      setSetupReport(report);
      setSuccess("Your spreadsheet has been created and is ready to use.");
      trackEvent("setup_created");
    } catch (createError) {
      const err = createError as AppError;
      setError(err.message);
      if (err.templateCopyFailed && err.templateUrl) {
        setTemplateCopyUrl(err.templateUrl);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return {
    error,
    success,
    setupReport,
    headerDetails,
    templateCopyUrl,
    showMappingEditor,
    setShowMappingEditor,
    newSheetName,
    setNewSheetName,
    isSaving,
    isPicking,
    isCreating,
    busy: isSaving || isPicking,
    resetBanners,
    onPickFromDrive,
    onCreateSpreadsheet,
    resaveCurrentSpreadsheet: () => saveSpreadsheet(spreadsheetUrl.trim()),
  };
}
