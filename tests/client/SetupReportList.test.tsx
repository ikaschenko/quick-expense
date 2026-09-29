import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SetupReportList } from "../../app-web/components/SetupReportList";
import { SetupReport } from "../../app-web/types/expense";

function report(overrides: Partial<SetupReport> = {}): SetupReport {
  return { tabAction: "found", headersAction: "valid", ...overrides };
}

describe("SetupReportList", () => {
  it.each([
    ["created", "✓ Expenses tab created"],
    ["found", "✓ Expenses tab found"],
  ] as const)("renders the %s tab action", (tabAction, expected) => {
    render(<SetupReportList report={report({ tabAction })} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("uses the short wording for created headers in the fresh variant", () => {
    render(<SetupReportList report={report({ headersAction: "created" })} variant="short" />);
    expect(screen.getByText("✓ Column headers created")).toBeTruthy();
  });

  it("uses the full wording for created headers by default", () => {
    render(<SetupReportList report={report({ headersAction: "created" })} />);
    expect(screen.getByText("✓ Column headers created automatically")).toBeTruthy();
  });

  it("reports legacy migration in the full variant", () => {
    render(<SetupReportList report={report({ headersAction: "migrated" })} />);
    expect(screen.getByText("✓ Columns migrated from legacy format")).toBeTruthy();
  });

  it("falls back to valid headers when migration is not shown in the short variant", () => {
    render(<SetupReportList report={report({ headersAction: "migrated" })} variant="short" />);
    expect(screen.getByText("✓ Column headers valid")).toBeTruthy();
  });
});
