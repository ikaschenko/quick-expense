import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { DisplayPreferencesCard } from "../../app-web/components/DisplayPreferencesCard";
import { DATE_DISPLAY_FORMAT_STORAGE_KEY } from "../../app-web/utils/date";

beforeEach(() => {
  localStorage.clear();
});

describe("DisplayPreferencesCard", () => {
  it("defaults to the browser locale when nothing is stored", () => {
    render(<DisplayPreferencesCard />);
    expect((screen.getByLabelText("Date format") as HTMLSelectElement).value).toBe("locale");
  });

  it("restores the stored format", () => {
    localStorage.setItem(DATE_DISPLAY_FORMAT_STORAGE_KEY, "iso");
    render(<DisplayPreferencesCard />);
    expect((screen.getByLabelText("Date format") as HTMLSelectElement).value).toBe("iso");
  });

  it("falls back to the browser locale for an unrecognised stored value", () => {
    localStorage.setItem(DATE_DISPLAY_FORMAT_STORAGE_KEY, "klingon");
    render(<DisplayPreferencesCard />);
    expect((screen.getByLabelText("Date format") as HTMLSelectElement).value).toBe("locale");
  });

  it("persists the selected format", () => {
    render(<DisplayPreferencesCard />);
    fireEvent.change(screen.getByLabelText("Date format"), { target: { value: "dmy" } });
    expect(localStorage.getItem(DATE_DISPLAY_FORMAT_STORAGE_KEY)).toBe("dmy");
    expect((screen.getByLabelText("Date format") as HTMLSelectElement).value).toBe("dmy");
  });
});
