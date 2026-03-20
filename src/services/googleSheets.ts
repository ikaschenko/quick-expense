import {
  ExpenseRecord,
  FxRateBackupPayload,
  FxRateBackupRecord,
  SpreadsheetConfig,
} from "../types/expense";
import { requestJson, requestNoContent } from "./http";

export const googleSheetsService = {
  async getPickerConfig(): Promise<{ accessToken: string }> {
    return requestJson("/api/auth/picker-config");
  },

  async getConfig(): Promise<SpreadsheetConfig | null> {
    const response = await requestJson<{ config: SpreadsheetConfig | null }>("/api/config");
    return response.config;
  },

  async saveConfig(spreadsheetUrl: string): Promise<SpreadsheetConfig> {
    const response = await requestJson<{ config: SpreadsheetConfig }>("/api/config", {
      method: "POST",
      body: JSON.stringify({ spreadsheetUrl }),
    });
    return response.config;
  },

  async clearConfig(): Promise<void> {
    await requestNoContent("/api/config", {
      method: "DELETE",
    });
  },

  async loadExpenses(): Promise<{
    records: ExpenseRecord[];
    payloadBytes: number;
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
};
