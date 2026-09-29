import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SetupPathChooser } from "../../app-web/components/SetupPathChooser";

describe("SetupPathChooser", () => {
  it("shows the intro when config is loaded without errors", () => {
    render(<SetupPathChooser isConfigLoading={false} configError={null} onChoose={vi.fn()} />);
    expect(screen.getByText(/Connect Quick Expense to a Google Spreadsheet/)).toBeTruthy();
  });

  it("shows a loading block and disables both path buttons while config loads", () => {
    render(<SetupPathChooser isConfigLoading={true} configError={null} onChoose={vi.fn()} />);
    expect(screen.getByText("Checking your current setup status…")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create my spreadsheet/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Connect a spreadsheet/i }).hasAttribute("disabled")).toBe(true);
  });

  it("renders the config error instead of the intro", () => {
    render(<SetupPathChooser isConfigLoading={false} configError="Boom" onChoose={vi.fn()} />);
    expect(screen.getByText("Boom")).toBeTruthy();
    expect(screen.queryByText(/Connect Quick Expense to a Google Spreadsheet/)).toBeNull();
  });

  it.each([
    [/Create my spreadsheet/i, "fresh"],
    [/Connect a spreadsheet/i, "existing"],
  ] as const)("calls onChoose with %s → %s", (label, path) => {
    const onChoose = vi.fn();
    render(<SetupPathChooser isConfigLoading={false} configError={null} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onChoose).toHaveBeenCalledWith(path);
  });
});
