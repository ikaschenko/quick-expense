import { describe, it, expect } from "vitest";
import {
  assertColumnInfoConsistency,
  classifyColumns,
  typeLabel,
  configModeBadgeLabel,
  configModeTooltip,
} from "../../app-web/utils/setupColumns";
import { ColumnInfo } from "../../app-web/types/expense";

describe("classifyColumns", () => {
  it("returns the fixed columns in sheet order when there are no extras", () => {
    expect(classifyColumns([], []).map((c) => c.name)).toEqual([
      "Date", "USD", "Category", "Spent By", "Spent For", "Comment",
    ]);
  });

  it("places optional currencies before USD and custom columns after Comment", () => {
    expect(classifyColumns(["EUR", "PLN"], ["Project"]).map((c) => c.name)).toEqual([
      "Date", "EUR", "PLN", "USD", "Category", "Spent By", "Spent For", "Comment", "Project",
    ]);
  });

  it("marks optional currencies and custom columns as hideable", () => {
    const columns = classifyColumns(["EUR"], ["Project"]);
    expect(columns.find((c) => c.name === "EUR")).toEqual({ name: "EUR", type: "optional-currency", hideable: true });
    expect(columns.find((c) => c.name === "Project")).toEqual({ name: "Project", type: "custom-column", hideable: true });
  });

  it.each([
    ["Date", false],
    ["USD", false],
    ["Category", false],
    ["Spent By", true],
    ["Spent For", true],
    ["Comment", false],
  ])("marks %s as hideable=%s", (name, hideable) => {
    expect(classifyColumns([], []).find((c) => c.name === name)?.hideable).toBe(hideable);
  });
});

describe("assertColumnInfoConsistency", () => {
  it.each([
    ["mandatory-currency", true],
    ["optional-currency", false],
    ["custom-column", false],
  ])("throws when a %s column has hideable=%s", (type, hideable) => {
    const col = { name: "X", type, hideable } as ColumnInfo;
    expect(() => assertColumnInfoConsistency(col)).toThrow(/ColumnInfo inconsistency/);
  });

  it("accepts a consistent mandatory field", () => {
    expect(() => assertColumnInfoConsistency({ name: "Date", type: "mandatory-field", hideable: false })).not.toThrow();
  });
});

describe("typeLabel", () => {
  it.each([
    ["mandatory-field", "Mandatory field"],
    ["mandatory-currency", "Mandatory currency"],
    ["optional-currency", "Optional currency"],
    ["custom-column", "Custom column"],
  ] as const)("maps %s to %s", (type, label) => {
    expect(typeLabel(type)).toBe(label);
  });
});

describe("configModeBadgeLabel", () => {
  it.each([
    ["config-driven", "Config detected"],
    ["config-no-mapping", "Config detected"],
    ["default", "Default rules"],
    ["config-invalid", "Config invalid — using defaults"],
  ] as const)("maps %s to %s", (mode, label) => {
    expect(configModeBadgeLabel(mode)).toBe(label);
  });
});

describe("configModeTooltip", () => {
  it.each([
    ["config-driven", "QuickExpense is using your Config sheet settings."],
    ["config-no-mapping", "Config sheet found. No column mapping is active."],
    ["default", "No Config sheet found. Standard column rules apply."],
  ] as const)("maps %s to its tooltip", (mode, tooltip) => {
    expect(configModeTooltip(mode)).toBe(tooltip);
  });

  it("returns undefined for config-invalid", () => {
    expect(configModeTooltip("config-invalid")).toBeUndefined();
  });
});
