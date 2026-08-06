import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FormattedAmount } from "../../app-web/components/FormattedAmount";

describe("FormattedAmount", () => {
  it("splits whole and fractional parts into separate spans with the prefix on the whole part", () => {
    const { container } = render(<FormattedAmount prefix="$" value={37.37} />);
    expect(container.querySelector(".amount-whole")?.textContent).toBe("$37");
    expect(container.querySelector(".amount-fraction")?.textContent).toBe(".37");
  });

  it("renders without a fraction span when fractionDigits is 0", () => {
    const { container } = render(<FormattedAmount prefix="$" value={37.37} fractionDigits={0} />);
    expect(container.querySelector(".amount-fraction")).toBeNull();
    expect(container.querySelector(".amount-whole")).toBeNull();
    expect(container.textContent).toBe("$37");
  });
});
