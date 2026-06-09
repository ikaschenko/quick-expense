import {
  ColumnMapping,
  ConfigMode,
  ConfigResponse,
  CurrencyDictionary,
  ExpenseRecord,
  FxRateBackupPayload,
  FxRateBackupRecord,
  SetupReport,
  SpreadsheetConfig,
} from "../types/expense";
import { requestJson, requestNoContent } from "./http";

interface SheetStructure {
  currencies: string[];
  customColumns: string[];
}

export const googleSheetsService = {
  async getPickerConfig(): Promise<{ accessToken: string; apiKey: string; appId: string }> {
    return requestJson("/api/auth/picker-config");
  },

  async getConfig(): Promise<ConfigResponse> {
    return requestJson<ConfigResponse>("/api/config");
  },

  async getSpreadsheetFileName(): Promise<{ fileName: string }> {
    return requestJson<{ fileName: string }>("/api/config/file-info");
  },

  async saveConfig(spreadsheetUrl: string): Promise<{ config: SpreadsheetConfig; setupReport: SetupReport }> {
    return requestJson<{ config: SpreadsheetConfig; setupReport: SetupReport }>("/api/config", {
      method: "POST",
      body: JSON.stringify({ spreadsheetUrl }),
    });
  },

  async clearConfig(): Promise<void> {
    await requestNoContent("/api/config", {
      method: "DELETE",
    });
  },

  async loadExpenses(): Promise<{
    records: ExpenseRecord[];
    payloadBytes: number;
    sheetCurrencies: string[];
    customColumns: string[];
  }> {
    return requestJson("/api/expenses");
  },

  async getExpenseRowCount(): Promise<{ rowCount: number }> {
    return requestJson<{ rowCount: number }>("/api/expenses/count");
  },

  async appendExpenseRow(values: string[], fxRateBackup?: FxRateBackupPayload): Promise<ExpenseRecord> {
    return requestJson<ExpenseRecord>("/api/expenses", {
      method: "POST",
      body: JSON.stringify({ values, fxRateBackup }),
    });
  },

  async updateExpenseRow(rowNumber: number, values: string[], fxRateBackup?: FxRateBackupPayload): Promise<ExpenseRecord> {
    return requestJson<ExpenseRecord>(`/api/expenses/${rowNumber}`, {
      method: "PUT",
      body: JSON.stringify({ values, fxRateBackup }),
    });
  },

  async deleteLastExpenseRow(expectedRowCount: number): Promise<void> {
    await requestNoContent("/api/expenses/last", {
      method: "DELETE",
      body: JSON.stringify({ expectedRowCount }),
    });
  },

  async getLatestFxRateBackup(): Promise<FxRateBackupRecord | null> {
    const response = await requestJson<{ backup: FxRateBackupRecord | null }>("/api/fx-backup");
    return response.backup;
  },

  async getAvailableCurrencies(): Promise<CurrencyDictionary> {
    return requestJson("/currencies.json");
  },

  // ─── Sheet Structure Management ──────────────────────────────────────────

  async addSheetCurrency(code: string): Promise<SheetStructure> {
    return requestJson("/api/sheet/currency", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  async addSheetColumn(name: string): Promise<SheetStructure> {
    return requestJson("/api/sheet/column", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async renameSheetColumn(currentName: string, newName: string): Promise<SheetStructure> {
    return requestJson("/api/sheet/column/rename", {
      method: "PATCH",
      body: JSON.stringify({ currentName, newName }),
    });
  },

  async reorderSheetColumns(orderedNames: string[]): Promise<SheetStructure> {
    return requestJson("/api/sheet/columns/reorder", {
      method: "PUT",
      body: JSON.stringify({ orderedNames }),
    });
  },

  async reorderSheetCurrencies(orderedCodes: string[]): Promise<SheetStructure> {
    return requestJson("/api/sheet/currencies/reorder", {
      method: "PUT",
      body: JSON.stringify({ orderedCodes }),
    });
  },

  async removeSheetColumn(name: string): Promise<SheetStructure> {
    return requestJson("/api/sheet/column", {
      method: "DELETE",
      body: JSON.stringify({ name }),
    });
  },

  async createSpreadsheet(name?: string): Promise<{ config: SpreadsheetConfig; setupReport: SetupReport }> {
    return requestJson<{ config: SpreadsheetConfig; setupReport: SetupReport }>("/api/config/create-spreadsheet", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async getColumnMapping(): Promise<{ mapping: ColumnMapping | null; mode: ConfigMode; detectedColumns: string[] }> {
    return requestJson("/api/config/mapping");
  },

  async saveColumnMapping(mapping: ColumnMapping): Promise<{ mapping: ColumnMapping; mode: ConfigMode }> {
    return requestJson("/api/config/mapping", {
      method: "POST",
      body: JSON.stringify({ mapping, confirmed: true }),
    });
  },

  async toggleColumnVisibility(field: string, hidden: boolean): Promise<{ hiddenColumns: string[] }> {
    return requestJson("/api/config/column-visibility", {
      method: "PATCH",
      body: JSON.stringify({ field, hidden }),
    });
  },
};
