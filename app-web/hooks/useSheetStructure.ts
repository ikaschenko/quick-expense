import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConfig } from "../contexts/ConfigContext";
import { googleSheetsService } from "../services/googleSheets";
import { trackEvent } from "../services/analytics";
import { ColumnInfo, CurrencyDictionary } from "../types/expense";
import { classifyColumns } from "../utils/setupColumns";
import { validateColumnName } from "../utils/spreadsheet";

export interface SheetStructure {
  columns: ColumnInfo[];
  currencies: string[];
  customColumns: string[];
  hiddenColumns: string[];
  currencyDictionary: CurrencyDictionary | null;
  maxOptionalCurrencies: number;
  actionError: string | null;
  actionSuccess: string | null;
  actionBusy: boolean;
  fieldError: string | null;
  clearFieldError: () => void;
  isAddingCurrency: boolean;
  newCurrencyCode: string;
  setNewCurrencyCode: (code: string) => void;
  startAddingCurrency: () => void;
  cancelAddingCurrency: () => void;
  submitAddCurrency: (e: FormEvent) => Promise<void>;
  isAddingColumn: boolean;
  newColumnName: string;
  setNewColumnName: (name: string) => void;
  startAddingColumn: () => void;
  cancelAddingColumn: () => void;
  submitAddColumn: (e: FormEvent) => Promise<void>;
  renamingColumn: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  startRenaming: (colName: string) => void;
  cancelRenaming: () => void;
  submitRename: (e: FormEvent) => Promise<void>;
  moveCurrency: (index: number, direction: -1 | 1) => Promise<void>;
  moveCustomColumn: (index: number, direction: -1 | 1) => Promise<void>;
  confirmRemoveName: string | null;
  startRemove: (colName: string) => void;
  cancelRemove: () => void;
  executeRemove: () => Promise<void>;
  toggleVisibility: (fieldName: string) => Promise<void>;
}

export function useSheetStructure(): SheetStructure {
  const { config, updateStructure, toggleColumnVisibility, loadDefaults } = useConfig();

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [currencyDictionary, setCurrencyDictionary] = useState<CurrencyDictionary | null>(null);
  const [isAddingCurrency, setIsAddingCurrency] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState("");
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmRemoveName, setConfirmRemoveName] = useState<string | null>(null);

  useEffect(() => {
    if (config?.spreadsheetId) {
      void googleSheetsService.getAvailableCurrencies().then(setCurrencyDictionary).catch(() => undefined);
    }
  }, [config?.spreadsheetId]);

  const currencies = config?.currencies ?? [];
  const customColumns = config?.customColumns ?? [];

  const columns = useMemo(
    () => classifyColumns(config?.currencies ?? [], config?.customColumns ?? []),
    [config?.currencies, config?.customColumns],
  );

  function clearActionBanners(): void {
    setActionError(null);
    setActionSuccess(null);
    setFieldError(null);
  }

  /** Closes every inline form so only one edit affordance is open at a time. */
  function closeInlineForms(): void {
    setIsAddingCurrency(false);
    setIsAddingColumn(false);
    setRenamingColumn(null);
    setConfirmRemoveName(null);
  }

  async function runStructureAction(
    action: () => Promise<{ currencies: string[]; customColumns: string[] }>,
    onSuccess: () => void,
    onFailure?: () => void,
  ): Promise<void> {
    setActionBusy(true);
    setFieldError(null);
    try {
      const result = await action();
      updateStructure(result.currencies, result.customColumns);
      await loadDefaults();
      onSuccess();
    } catch (err) {
      setActionError((err as Error).message);
      onFailure?.();
    } finally {
      setActionBusy(false);
    }
  }

  const startAddingCurrency = (): void => {
    clearActionBanners();
    closeInlineForms();
    setNewCurrencyCode("");
    setIsAddingCurrency(true);
  };

  const cancelAddingCurrency = (): void => {
    setIsAddingCurrency(false);
    setNewCurrencyCode("");
    setFieldError(null);
  };

  const submitAddCurrency = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code) { setFieldError("Currency code cannot be empty."); return; }
    if (code.length > 10) { setFieldError("Currency code must be 10 characters or less."); return; }
    if (code.toLowerCase() === "usd") { setFieldError("USD is already a mandatory column."); return; }
    if (currencies.some((c) => c.toLowerCase() === code.toLowerCase())) {
      setFieldError(`Currency "${code}" already exists.`);
      return;
    }

    await runStructureAction(
      () => googleSheetsService.addSheetCurrency(code),
      () => {
        setIsAddingCurrency(false);
        setNewCurrencyCode("");
        setActionSuccess(`Currency column "${code}" added.`);
        trackEvent("currency_added", { code });
      },
    );
  };

  const startAddingColumn = (): void => {
    clearActionBanners();
    closeInlineForms();
    setNewColumnName("");
    setIsAddingColumn(true);
  };

  const cancelAddingColumn = (): void => {
    setIsAddingColumn(false);
    setNewColumnName("");
    setFieldError(null);
  };

  const submitAddColumn = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const name = newColumnName.trim();
    const validationError = validateColumnName(name, customColumns);
    if (validationError) { setFieldError(validationError); return; }

    await runStructureAction(
      () => googleSheetsService.addSheetColumn(name),
      () => {
        setIsAddingColumn(false);
        setNewColumnName("");
        setActionSuccess(`Column "${name}" added.`);
        trackEvent("column_added", { name });
      },
    );
  };

  const startRenaming = (colName: string): void => {
    clearActionBanners();
    closeInlineForms();
    setRenamingColumn(colName);
    setRenameValue(colName);
  };

  const cancelRenaming = (): void => {
    setRenamingColumn(null);
    setRenameValue("");
    setFieldError(null);
  };

  const submitRename = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!renamingColumn) return;
    const newName = renameValue.trim();
    const validationError = validateColumnName(newName, [...currencies, ...customColumns], renamingColumn);
    if (validationError) { setFieldError(validationError); return; }

    await runStructureAction(
      () => googleSheetsService.renameSheetColumn(renamingColumn, newName),
      () => {
        setRenamingColumn(null);
        setRenameValue("");
        setActionSuccess(`Column renamed to "${newName}".`);
      },
    );
  };

  const moveCurrency = async (index: number, direction: -1 | 1): Promise<void> => {
    const next = swap(currencies, index, index + direction);
    if (!next) return;
    clearActionBanners();
    await runStructureAction(() => googleSheetsService.reorderSheetCurrencies(next), () => undefined);
  };

  const moveCustomColumn = async (index: number, direction: -1 | 1): Promise<void> => {
    const next = swap(customColumns, index, index + direction);
    if (!next) return;
    clearActionBanners();
    await runStructureAction(() => googleSheetsService.reorderSheetColumns(next), () => undefined);
  };

  const startRemove = (colName: string): void => {
    clearActionBanners();
    closeInlineForms();
    setConfirmRemoveName(colName);
  };

  const executeRemove = async (): Promise<void> => {
    if (!confirmRemoveName) return;
    await runStructureAction(
      () => googleSheetsService.removeSheetColumn(confirmRemoveName),
      () => {
        setConfirmRemoveName(null);
        setActionSuccess(`Column "${confirmRemoveName}" removed.`);
      },
      () => setConfirmRemoveName(null),
    );
  };

  const toggleVisibility = async (fieldName: string): Promise<void> => {
    if (!config) return;
    clearActionBanners();
    const isCurrentlyHidden = (config.hiddenColumns ?? []).includes(fieldName);
    setActionBusy(true);
    try {
      await toggleColumnVisibility(fieldName, !isCurrentlyHidden);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  return {
    columns,
    currencies,
    customColumns,
    hiddenColumns: config?.hiddenColumns ?? [],
    currencyDictionary,
    maxOptionalCurrencies: currencyDictionary?.maxOptional ?? 0,
    actionError,
    actionSuccess,
    actionBusy,
    fieldError,
    clearFieldError: () => setFieldError(null),
    isAddingCurrency,
    newCurrencyCode,
    setNewCurrencyCode,
    startAddingCurrency,
    cancelAddingCurrency,
    submitAddCurrency,
    isAddingColumn,
    newColumnName,
    setNewColumnName,
    startAddingColumn,
    cancelAddingColumn,
    submitAddColumn,
    renamingColumn,
    renameValue,
    setRenameValue,
    startRenaming,
    cancelRenaming,
    submitRename,
    moveCurrency,
    moveCustomColumn,
    confirmRemoveName,
    startRemove,
    cancelRemove: () => setConfirmRemoveName(null),
    executeRemove,
    toggleVisibility,
  };
}

function swap(list: string[], from: number, to: number): string[] | null {
  if (to < 0 || to >= list.length) return null;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
