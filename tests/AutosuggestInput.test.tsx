import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AutosuggestInput } from "../src/components/AutosuggestInput";

const SUGGESTIONS = ["Coffee", "Taxi to airport", "Lunch at work", "Coffee shop"];

function Controlled({ minChars = 3 }: { minChars?: number }) {
  const [value, setValue] = useState("");
  return (
    <AutosuggestInput
      id="test-input"
      value={value}
      onChange={setValue}
      allSuggestions={SUGGESTIONS}
      minChars={minChars}
      placeholder="Add a note…"
    />
  );
}

describe("AutosuggestInput", () => {
  it("renders an input with the given placeholder", () => {
    render(<Controlled />);
    expect(screen.getByPlaceholderText("Add a note…")).toBeTruthy();
  });

  it("does not show the dropdown when fewer than minChars are typed", async () => {
    const user = userEvent.setup();
    render(<Controlled minChars={3} />);
    await user.type(screen.getByRole("combobox"), "co");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the dropdown with matching options once minChars threshold is reached", async () => {
    const user = userEvent.setup();
    render(<Controlled minChars={3} />);
    await user.type(screen.getByRole("combobox"), "cof");
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(2); // "Coffee" and "Coffee shop"
  });

  it("performs case-insensitive substring matching", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole("combobox"), "TAX");
    const options = screen.getAllByRole("option");
    expect(options[0].textContent).toBe("Taxi to airport");
  });

  it("hides the dropdown when there are no matches", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole("combobox"), "xyz");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects an option on click and closes the dropdown", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole("combobox"), "lun");
    await user.click(screen.getByRole("option", { name: "Lunch at work" }));
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Lunch at work");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("navigates options with ArrowDown/ArrowUp and selects with Enter", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    await user.type(input, "cof");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{Enter}");
    // After down, down, up → index 0 → first option "Coffee"
    expect((input as HTMLInputElement).value).toBe("Coffee");
  });

  it("closes the dropdown on Escape without changing the value", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    await user.type(input, "cof");
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("cof");
  });
});
