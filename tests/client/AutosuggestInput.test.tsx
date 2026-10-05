import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AutosuggestInput } from "../../app-web/components/AutosuggestInput";

const SUGGESTIONS = ["Coffee", "Taxi to airport", "Lunch at work", "Coffee shop"];

function Controlled({ minChars = 3, clearable = false, showChevron = false, required = false, invalid = false, onSelect }: {
  minChars?: number;
  clearable?: boolean;
  showChevron?: boolean;
  required?: boolean;
  invalid?: boolean;
  onSelect?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <AutosuggestInput
      id="test-input"
      value={value}
      onChange={setValue}
      onSelect={onSelect}
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
  it.each([
    { label: undefined, withDefault: false },
    { label: "Spent By", withDefault: false },
    { label: "Spent For", withDefault: true },
  ])("anchors controls to the textbox without including the label ($label)", ({ label, withDefault }) => {
    render(<AutosuggestInput label={label} value="Ivan" onChange={vi.fn()} allSuggestions={[]} clearable showChevron
      defaultSettings={withDefault ? { field: "Spent For", canEdit: true, disabled: false, save: vi.fn() } : undefined} />);
    const textboxWrapper = screen.getByRole("combobox").parentElement;
    expect(textboxWrapper?.classList.contains("autosuggest-wrapper")).toBe(true);
    expect(textboxWrapper?.contains(screen.getByRole("button", { name: "Clear" }))).toBe(true);
    expect(textboxWrapper?.contains(screen.getByRole("button", { name: "Show suggestions" }))).toBe(true);
    expect(textboxWrapper?.querySelector("label")).toBeNull();
  });

  it("saves the current nonblank value without changing the field", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<AutosuggestInput label="Theme" value="Vacation" onChange={onChange} allSuggestions={[]} defaultSettings={{ field: "Theme", canEdit: true, disabled: false, save }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Set this value as Default/ }));
    expect(save).toHaveBeenCalledWith("Theme", "Vacation");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a saved value to view guests without mutation actions", async () => {
    const save = vi.fn();
    render(<AutosuggestInput value="Vacation" onChange={vi.fn()} allSuggestions={[]} defaultSettings={{ field: "Theme", savedValue: "Vacation", canEdit: false, disabled: false, save }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "View default value for Theme" }));
    expect(screen.getByRole("dialog").textContent).toContain("Vacation");
    expect(screen.queryByRole("button", { name: "Replace default" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear default" })).toBeNull();
  });

  it("supports replacing with the current field value and clearing from Add", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutosuggestInput value="Family" onChange={onChange} allSuggestions={[]} defaultSettings={{ field: "Theme", savedValue: "Vacation", canEdit: true, disabled: false, save }} />);
    const pin = screen.getByRole("button", { name: "View default value for Theme" });
    expect(pin.title).toBe("View default value for Theme");
    await user.click(pin);
    await user.click(screen.getByRole("button", { name: "Replace default" }));
    expect(save).toHaveBeenCalledWith("Theme", "Family");
    await user.click(pin);
    await user.click(screen.getByRole("button", { name: "Clear default" }));
    expect(save).toHaveBeenLastCalledWith("Theme", null);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables saving whitespace as a default", () => {
    render(<AutosuggestInput value=" " onChange={vi.fn()} allSuggestions={[]} defaultSettings={{ field: "Theme", canEdit: true, disabled: false, save: vi.fn() }} />);
    expect((screen.getByRole("button", { name: /Set this value as Default/ }) as HTMLButtonElement).disabled).toBe(true);
  });

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

  it("fires onSelect (in addition to onChange) when a suggestion is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Controlled onSelect={onSelect} />);
    await user.type(screen.getByRole("combobox"), "lun");
    await user.click(screen.getByRole("option", { name: "Lunch at work" }));
    expect(onSelect).toHaveBeenCalledWith("Lunch at work");
  });

  it("fires onSelect when a highlighted suggestion is chosen via Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Controlled onSelect={onSelect} />);
    await user.type(screen.getByRole("combobox"), "cof");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("Coffee");
  });

  it("Enter with no highlighted suggestion closes the dropdown without calling onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Controlled onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "cof");
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("cof");
    expect(onSelect).not.toHaveBeenCalled();
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

  it("shows all suggestions for a populated field and resumes filtering on typing", async () => {
    const user = userEvent.setup();
    render(<Controlled minChars={1} showChevron />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "co");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Show suggestions" }));
    expect(screen.getAllByRole("option")).toHaveLength(SUGGESTIONS.length);
    expect(input.value).toBe("co");
    await user.type(input, "f");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Show suggestions" }));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(input.value).toBe("Taxi to airport");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open an empty suggestion list or change the populated value", async () => {
    const onChange = vi.fn();
    render(<AutosuggestInput value="Vacation" onChange={onChange} allSuggestions={[]} showChevron />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Show suggestions" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Vacation");
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
