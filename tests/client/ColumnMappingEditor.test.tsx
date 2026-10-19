import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ColumnMappingEditor } from "../../app-web/components/ColumnMappingEditor";
import { REQUIRED_QE_FIELDS } from "../../app-web/constants/expenses";
import { googleSheetsService } from "../../app-web/services/googleSheets";

vi.mock("../../app-web/services/googleSheets", () => ({ googleSheetsService: { saveColumnMapping: vi.fn() } }));

beforeEach(() => vi.mocked(googleSheetsService.saveColumnMapping).mockReset().mockResolvedValue({ mapping: {}, mode: "config-driven" }));

describe("ColumnMappingEditor explicit target", () => {
  it.each([false, true])("saves only its explicit sheet with candidate=%s", async (candidate) => {
    const onSaved = vi.fn();
    render(<ColumnMappingEditor detectedColumns={[...REQUIRED_QE_FIELDS]} spreadsheetId="original-sheet" candidate={candidate} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save mapping" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(googleSheetsService.saveColumnMapping).toHaveBeenCalledWith({}, "original-sheet", candidate);
  });

  it("does not offer to save when the editor has no explicit target", () => {
    render(<ColumnMappingEditor detectedColumns={[...REQUIRED_QE_FIELDS]} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Save mapping" }) as HTMLButtonElement).disabled).toBe(true);
    expect(googleSheetsService.saveColumnMapping).not.toHaveBeenCalled();
  });
});
