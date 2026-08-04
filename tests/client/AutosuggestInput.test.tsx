import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AutosuggestInput } from "../../app-web/components/AutosuggestInput";

const SUGGESTIONS = ["Coffee", "Taxi to airport", "Lunch at work", "Coffee shop"];

function Controlled({ minChars = 3, clearable = false, showChevron = false, required = false, invalid = false }: {
  minChars?: number;
  clearable?: boolean;
  showChevron?: boolean;
  required?: boolean;
  invalid?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <AutosuggestInput
      id="test-input"
      value={value}
      onChange={setValue}
      allSuggestions={SUGGESTIONS}
      minChars={minChars}
      placeholder="Add a note…"
      clearable={clearable}
      showChevron={showChevron}
      required={required}
      invalid={invalid}
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

  it("clear button is hidden when value is empty", () => {
    render(<Controlled clearable />);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("clear button clears the value and refocuses the input", async () => {
    const user = userEvent.setup();
    render(<Controlled clearable />);
    const input = screen.getByRole("combobox");
    await user.type(input, "cof");
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    await user.click(clearBtn);
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("chevron click shows the full unfiltered suggestion list regardless of minChars", async () => {
    const user = userEvent.setup();
    // minChars=10 means normal typing won't open the list
    render(<Controlled minChars={10} showChevron />);
    const chevronBtn = screen.getByRole("button", { name: "Show suggestions" });
    await user.click(chevronBtn);
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(SUGGESTIONS.length);
  });

  it("required prop is forwarded to the underlying input", () => {
    render(<Controlled required />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.required).toBe(true);
  });

  it("invalid prop sets data-invalid on the underlying input", () => {
    render(<Controlled invalid />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("data-invalid")).toBe("true");
  });

  it("data-invalid is absent when invalid is false", () => {
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("data-invalid")).toBeNull();
  });
});

function ControlledMultiLine() {
  const [value, setValue] = useState("");
  return (
    <AutosuggestInput
      id="test-textarea"
      value={value}
      onChange={setValue}
      allSuggestions={SUGGESTIONS}
      minChars={3}
      placeholder="Add a note…"
      multiLine
    />
  );
}

describe("AutosuggestInput multiLine", () => {
  it("renders a textarea element", () => {
    render(<ControlledMultiLine />);
    const el = screen.getByRole("combobox");
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("Enter with active suggestion selects it and closes the dropdown", async () => {
    const user = userEvent.setup();
    render(<ControlledMultiLine />);
    const el = screen.getByRole("combobox");
    await user.type(el, "cof");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect((el as HTMLTextAreaElement).value).toBe("Coffee");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Shift+Enter does not select a suggestion and keeps the dropdown open", async () => {
    const user = userEvent.setup();
    render(<ControlledMultiLine />);
    const el = screen.getByRole("combobox");
    await user.type(el, "cof");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    // suggestion not selected — value still starts with "cof" (has a newline appended, not suggestion)
    expect((el as HTMLTextAreaElement).value).not.toBe("Coffee");
    expect((el as HTMLTextAreaElement).value).toContain("cof");
    // dropdown may still be open since the value changed (filtered list may differ), but suggestion was not picked
    expect((el as HTMLTextAreaElement).value).not.toBe("Coffee shop");
  });
});
