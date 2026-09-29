import { useEffect, useState } from "react";
import { googleSheetsService } from "../services/googleSheets";
import { ColumnMapping, ConfigMode } from "../types/expense";

interface MappingData {
  mapping: ColumnMapping | null;
  mode: ConfigMode;
  detectedColumns: string[];
}

export interface ColumnMappingState {
  mappingData: MappingData | null;
  mappingLoadError: string | null;
  sectionOpen: boolean;
  toggleSection: () => void;
  editorOpen: boolean;
  openEditor: () => void;
  closeEditor: () => void;
  success: string | null;
  reload: () => void;
  retry: () => void;
  onEditorSaved: () => void;
}

export function useColumnMapping(enabled: boolean, spreadsheetId: string | undefined): ColumnMappingState {
  const [mappingData, setMappingData] = useState<MappingData | null>(null);
  const [mappingLoadError, setMappingLoadError] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !spreadsheetId) return;
    setMappingLoadError(null);
    setMappingData(null);
    void googleSheetsService
      .getColumnMapping()
      .then(setMappingData)
      .catch((err) => setMappingLoadError((err as Error).message));
  }, [enabled, spreadsheetId]);

  const reload = (): void => {
    void googleSheetsService
      .getColumnMapping()
      .then(setMappingData)
      .catch((err) => setMappingLoadError((err as Error).message));
  };

  return {
    mappingData,
    mappingLoadError,
    sectionOpen,
    toggleSection: () => {
      setSectionOpen((v) => !v);
      setEditorOpen(false);
      setSuccess(null);
    },
    editorOpen,
    openEditor: () => {
      setSuccess(null);
      setEditorOpen(true);
    },
    closeEditor: () => setEditorOpen(false),
    success,
    reload,
    retry: () => {
      setMappingLoadError(null);
      reload();
    },
    onEditorSaved: () => {
      setEditorOpen(false);
      setSuccess("Mapping updated.");
      reload();
    },
  };
}
