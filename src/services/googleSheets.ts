import {
  CurrencyDictionary,
  ExpenseRecord,
  FxRateBackupPayload,
  FxRateBackupRecord,
  SetupReport,
  SpreadsheetConfig,
} from "../types/expense";
import { requestJson, requestNoContent } from "./http";

export const googleSheetsService = {
  async getPickerConfig(): Promise<{ accessToken: string; apiKey: string; appId: string }> {
    return requestJson("/api/auth/picker-config");
  },

  async getConfig(): Promise<SpreadsheetConfig | null> {
    const response = await requestJson<{ config: SpreadsheetConfig | null }>("/api/config");
    return response.config;
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
  }> {
    return requestJson("/api/expenses");
  },

  async appendExpenseRow(values: string[], fxRateBackup?: FxRateBackupPayload): Promise<void> {
    await requestNoContent("/api/expenses", {
      method: "POST",
      body: JSON.stringify({ values, fxRateBackup }),
    });
  },

  async getLatestFxRateBackup(): Promise<FxRateBackupRecord | null> {
    const response = await requestJson<{ backup: FxRateBackupRecord | null }>("/api/fx-backup");
    return response.backup;
  },

  async getAvailableCurrencies(): Promise<CurrencyDictionary> {
    return requestJson("/api/currencies/available");
  },

  async getUserCurrencies(): Promise<string[]> {
    const response = await requestJson<{ currencies: string[] }>("/api/currencies");
    return response.currencies;
  },

  async saveUserCurrencies(codes: string[]): Promise<{ currencies: string[]; sheetCurrencies: string[] }> {
    return requestJson("/api/currencies", {
      method: "PUT",
      body: JSON.stringify({ currencies: codes }),
    });
  },
};
