import { SHEET_NAME } from "../constants/expenses";
import { SpreadsheetConfig } from "../types/expense";
import { readJsonStorage, writeJsonStorage } from "../utils/storage";

function getStorageKey(email: string): string {
  return `quick-expense.config.${email.toLowerCase()}`;
}

export const localConfigService = {
  load(email: string): SpreadsheetConfig | null {
    return readJsonStorage<SpreadsheetConfig>(localStorage, getStorageKey(email));
  },

  save(config: SpreadsheetConfig): void {
    writeJsonStorage(localStorage, getStorageKey(config.email), {
      ...config,
      sheetName: SHEET_NAME,
    });
  },

  clear(email: string): void {
    localStorage.removeItem(getStorageKey(email));
  },
};
