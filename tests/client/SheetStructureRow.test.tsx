import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { SheetStructureRow } from "../../app-web/components/SheetStructureRow";
import { SheetStructure } from "../../app-web/hooks/useSheetStructure";
import { ColumnInfo, SetupDefaults } from "../../app-web/types/expense";

const configContext = vi.hoisted(() => ({
  config: { isGuest: false, accessLevel: "edit" as "edit" | "view" },
  defaults: null as SetupDefaults | null,
  saveDefault: vi.fn(),
}));

vi.mock("../../app-web/contexts/ConfigContext", () => ({
  useConfig: () => ({
    ...configContext,
    defaultsConflict: false,
    isDefaultsLoading: false,
    isDefaultsSaving: false,
  }),
}));

function makeStructure(overrides: Partial<SheetStructure> = {}): SheetStructure {
  return {
    columns: [],
    currencies: ["EUR", "PLN"],
    customColumns: ["Project", "Trip"],
    hiddenColumns: [],
    currencyDictionary: null,
    maxOptionalCurrencies: 0,
    actionError: null,
    actionSuccess: null,
    actionBusy: false,
    fieldError: null,
    clearFieldError: vi.fn(),
    isAddingCurrency: false,
    newCurrencyCode: "",
    setNewCurrencyCode: vi.fn(),
    startAddingCurrency: vi.fn(),
    cancelAddingCurrency: vi.fn(),
    submitAddCurrency: vi.fn(),
    isAddingColumn: false,
    newColumnName: "",
    setNewColumnName: vi.fn(),
    startAddingColumn: vi.fn(),
    cancelAddingColumn: vi.fn(),
    submitAddColumn: vi.fn(),
    renamingColumn: null,
    renameValue: "",
    setRenameValue: vi.fn(),
    startRenaming: vi.fn(),
    cancelRenaming: vi.fn(),
    submitRename: vi.fn(),
    moveCurrency: vi.fn(),
    moveCustomColumn: vi.fn(),
    confirmRemoveName: null,
    startRemove: vi.fn(),
    cancelRemove: vi.fn(),
    executeRemove: vi.fn(),
    toggleVisibility: vi.fn(),
    ...overrides,
  };
}

const column = (name: string, type: ColumnInfo["type"], hideable: boolean): ColumnInfo => ({ name, type, hideable });

function renderRow(col: ColumnInfo, structure: SheetStructure) {
  return render(<ul><SheetStructureRow col={col} structure={structure} /></ul>);
}

describe("SheetStructureRow", () => {
  beforeEach(() => {
    configContext.config = { isGuest: false, accessLevel: "edit" };
    configContext.defaults = null;
    configContext.saveDefault.mockClear();
  });

  it.each(["owner", "edit guest", "view guest"])("shows a tooltip without default management actions for %s", async (role) => {
    configContext.config = { isGuest: role !== "owner", accessLevel: role === "view guest" ? "view" : "edit" };
    configContext.defaults = { version: "1", values: { Theme: "Vacation" } };
    renderRow(column("Theme", "custom-column", true), makeStructure());
    const button = screen.getByRole("button", { name: "Default value for Theme: Vacation" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    await userEvent.setup().click(button);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("To manage the default values please use Add Expense screen");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace default" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear default" })).toBeNull();
    expect(configContext.saveDefault).not.toHaveBeenCalled();
  });

  it("supports keyboard activation and dismisses the tooltip on Escape, outside tap, and blur", async () => {
    configContext.defaults = { version: "1", values: { "Spent For": "Family" } };
    renderRow(column("Spent For", "mandatory-field", true), makeStructure());
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Default value for Spent For: Family" });
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(button);
    await user.keyboard(" ");
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.click(button);
    await user.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(configContext.saveDefault).not.toHaveBeenCalled();
  });

  it("does not display a default value when the field has none", () => {
    configContext.defaults = { version: "1", values: {} };
    renderRow(column("Theme", "custom-column", true), makeStructure());
    expect(screen.queryByRole("button", { name: /Default value/ })).toBeNull();
  });

  it("displays a long default value without truncating its text", () => {
    const value = "Vacation".repeat(100);
    configContext.defaults = { version: "1", values: { Theme: value } };
    renderRow(column("Theme", "custom-column", true), makeStructure());
    expect(screen.getByRole("button", { name: `Default value for Theme: ${value}` }).textContent).toBe(`Default: ${value}`);
  });

  it("renders the column name and its type badge", () => {
    renderRow(column("EUR", "optional-currency", true), makeStructure());
    expect(screen.getByText("EUR")).toBeTruthy();
    expect(screen.getByText("Optional currency")).toBeTruthy();
  });

  it("offers no actions for a non-hideable mandatory field", () => {
    renderRow(column("Comment", "mandatory-field", false), makeStructure());
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers only the visibility toggle for a hideable mandatory field", () => {
    renderRow(column("Spent By", "mandatory-field", true), makeStructure());
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByLabelText(/Hide Spent By/)).toBeTruthy();
  });

  it("shows the Show label when the column is already hidden", () => {
    renderRow(column("Spent By", "mandatory-field", true), makeStructure({ hiddenColumns: ["Spent By"] }));
    expect(screen.getByLabelText(/Show Spent By/)).toBeTruthy();
  });

  it("disables Move up for the first currency and enables Move down", () => {
    renderRow(column("EUR", "optional-currency", true), makeStructure());
    expect(screen.getByLabelText("Move up").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Move down").hasAttribute("disabled")).toBe(false);
  });

  it("disables Move down for the last custom column", () => {
    renderRow(column("Trip", "custom-column", true), makeStructure());
    expect(screen.getByLabelText("Move down").hasAttribute("disabled")).toBe(true);
  });

  it("reorders currencies through moveCurrency", () => {
    const structure = makeStructure();
    renderRow(column("PLN", "optional-currency", true), structure);
    fireEvent.click(screen.getByLabelText("Move up"));
    expect(structure.moveCurrency).toHaveBeenCalledWith(1, -1);
  });

  it("reorders custom columns through moveCustomColumn", () => {
    const structure = makeStructure();
    renderRow(column("Project", "custom-column", true), structure);
    fireEvent.click(screen.getByLabelText("Move down"));
    expect(structure.moveCustomColumn).toHaveBeenCalledWith(0, 1);
  });

  it("starts a rename and a remove from the row actions", () => {
    const structure = makeStructure();
    renderRow(column("Project", "custom-column", true), structure);
    fireEvent.click(screen.getByLabelText("Rename Project"));
    fireEvent.click(screen.getByLabelText("Remove Project"));
    expect(structure.startRenaming).toHaveBeenCalledWith("Project");
    expect(structure.startRemove).toHaveBeenCalledWith("Project");
  });

  it("renders the rename form when the row is being renamed", () => {
    const structure = makeStructure({ renamingColumn: "Project", renameValue: "Proj", fieldError: "Name taken" });
    renderRow(column("Project", "custom-column", true), structure);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Proj");
    expect(screen.getByText("Name taken")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Cancel rename"));
    expect(structure.cancelRenaming).toHaveBeenCalled();
  });

  it("renders the remove confirmation when the row is pending removal", () => {
    const structure = makeStructure({ confirmRemoveName: "Project" });
    renderRow(column("Project", "custom-column", true), structure);
    expect(screen.getByText(/Remove “Project”\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(structure.executeRemove).toHaveBeenCalled();
  });

  it("disables row actions while a structure action is in flight", () => {
    renderRow(column("Project", "custom-column", true), makeStructure({ actionBusy: true }));
    expect(screen.getByLabelText("Rename Project").hasAttribute("disabled")).toBe(true);
  });
});
