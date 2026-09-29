import { ColumnInfo, ColumnType, ConfigMode } from "../types/expense";

/**
 * Asserts that a ColumnInfo has a consistent combination of type and hideable.
 * Called on every classifyColumns() invocation (i.e., on every backend load/save cycle).
 */
export function assertColumnInfoConsistency(col: ColumnInfo): void {
  if (col.type === "mandatory-currency" && col.hideable) {
    throw new Error(`ColumnInfo inconsistency: "${col.name}" is mandatory-currency but hideable=true`);
  }
  if (col.type === "optional-currency" && !col.hideable) {
    throw new Error(`ColumnInfo inconsistency: "${col.name}" is optional-currency but hideable=false`);
  }
  if (col.type === "custom-column" && !col.hideable) {
    throw new Error(`ColumnInfo inconsistency: "${col.name}" is custom-column but hideable=false`);
  }
}

export function classifyColumns(currencies: string[], customColumns: string[]): ColumnInfo[] {
  const result: ColumnInfo[] = [];
  result.push({ name: "Date", type: "mandatory-field", hideable: false });
  for (const code of currencies) {
    result.push({ name: code, type: "optional-currency", hideable: true });
  }
  result.push({ name: "USD", type: "mandatory-currency", hideable: false });
  result.push({ name: "Category", type: "mandatory-field", hideable: false });
  result.push({ name: "Spent By", type: "mandatory-field", hideable: true });
  result.push({ name: "Spent For", type: "mandatory-field", hideable: true });
  result.push({ name: "Comment", type: "mandatory-field", hideable: false });
  for (const col of customColumns) {
    result.push({ name: col, type: "custom-column", hideable: true });
  }
  for (const col of result) {
    assertColumnInfoConsistency(col);
  }
  return result;
}

export function typeLabel(type: ColumnType): string {
  switch (type) {
    case "mandatory-field": return "Mandatory field";
    case "mandatory-currency": return "Mandatory currency";
    case "optional-currency": return "Optional currency";
    case "custom-column": return "Custom column";
  }
}

export function configModeBadgeLabel(mode: ConfigMode): string {
  switch (mode) {
    case "config-driven": return "Config detected";
    case "config-no-mapping": return "Config detected";
    case "default": return "Default rules";
    case "config-invalid": return "Config invalid \u2014 using defaults";
  }
}

export function configModeTooltip(mode: ConfigMode): string | undefined {
  switch (mode) {
    case "config-driven": return "QuickExpense is using your Config sheet settings.";
    case "config-no-mapping": return "Config sheet found. No column mapping is active.";
    case "default": return "No Config sheet found. Standard column rules apply.";
    case "config-invalid": return undefined;
  }
}
