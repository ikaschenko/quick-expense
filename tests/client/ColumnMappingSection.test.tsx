import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ColumnMappingSection } from "../../app-web/components/ColumnMappingSection";
import { ColumnMappingState } from "../../app-web/hooks/useColumnMapping";

vi.mock("../../app-web/components/ColumnMappingEditor", () => ({
  ColumnMappingEditor: () => <div data-testid="mapping-editor" />,
}));

function makeMapping(overrides: Partial<ColumnMappingState> = {}): ColumnMappingState {
  return {
    mappingData: null,
    mappingLoadError: null,
    sectionOpen: true,
    toggleSection: vi.fn(),
    editorOpen: false,
    openEditor: vi.fn(),
    closeEditor: vi.fn(),
    success: null,
    reload: vi.fn(),
    retry: vi.fn(),
    onEditorSaved: vi.fn(),
    ...overrides,
  };
}

describe("ColumnMappingSection", () => {
  it("renders nothing but the toggle while the section is collapsed", () => {
    const mapping = makeMapping({ sectionOpen: false });
    render(<ColumnMappingSection mapping={mapping} />);
    fireEvent.click(screen.getByRole("button", { name: /Column mapping/i }));
    expect(mapping.toggleSection).toHaveBeenCalled();
    expect(screen.queryByText("Loading mapping…")).toBeNull();
  });

  it("shows a loading block until mapping data arrives", () => {
    render(<ColumnMappingSection mapping={makeMapping()} />);
    expect(screen.getByText("Loading mapping…")).toBeTruthy();
  });

  it("shows the load error with a retry action", () => {
    const mapping = makeMapping({ mappingLoadError: "Network down" });
    render(<ColumnMappingSection mapping={mapping} />);
    expect(screen.getByText(/Could not load mapping — Network down/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mapping.retry).toHaveBeenCalled();
  });

  it("explains that no mapping is configured for non config-driven modes", () => {
    render(<ColumnMappingSection mapping={makeMapping({ mappingData: { mapping: null, mode: "default", detectedColumns: [] } })} />);
    expect(screen.getByText(/No column mapping is configured/)).toBeTruthy();
    expect(screen.getByText("Not configured")).toBeTruthy();
  });

  it("renders the mapping table with user column names and an edit action", () => {
    const mapping = makeMapping({
      mappingData: { mapping: { Date: "When" }, mode: "config-driven", detectedColumns: ["When"] },
    });
    render(<ColumnMappingSection mapping={mapping} />);
    expect(screen.getByText("Config detected")).toBeTruthy();
    expect(screen.getByText("When")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit mapping" }));
    expect(mapping.openEditor).toHaveBeenCalled();
  });

  it("swaps the table for the editor when the editor is open", () => {
    const mapping = makeMapping({
      editorOpen: true,
      success: "Mapping updated.",
      mappingData: { mapping: null, mode: "config-driven", detectedColumns: [] },
    });
    render(<ColumnMappingSection mapping={mapping} />);
    expect(screen.getByTestId("mapping-editor")).toBeTruthy();
    expect(screen.getByText("Mapping updated.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit mapping" })).toBeNull();
  });
});
