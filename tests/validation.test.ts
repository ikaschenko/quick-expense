import { parsePositiveDecimal, validateExpenseDraft } from "../src/utils/validation";

describe("expense validation", () => {
  it("requires date, at least one currency, category, and WhoSpent", () => {
    const errors = validateExpenseDraft({
      Date: "",
      PLN: "",
      BYN: "",
      USD: "",
      EUR: "",
      Category: "",
      WhoSpent: "",
      ForWhom: "",
      Comment: "",
      PaymentChannel: "",
      Theme: "",
    });

    expect(errors.Date).toContain("YYYY-MM-DD");
    expect(errors.USD).toContain("at least one");
    expect(errors.Category).toContain("required");
    expect(errors.WhoSpent).toContain("required");
  });

  it("accepts valid decimal currency fields", () => {
    const errors = validateExpenseDraft({
      Date: "2026-03-14",
      PLN: "-10.25",
      BYN: "",
      USD: "",
      EUR: "",
      Category: "Misc",
      WhoSpent: "ivan@example.com",
      ForWhom: "",
      Comment: "",
      PaymentChannel: "",
      Theme: "",
    });

    expect(errors).toEqual({});
  });

  it("rejects submitting more than one non-USD currency amount", () => {
    const errors = validateExpenseDraft({
      Date: "2026-03-14",
      PLN: "10.25",
      BYN: "5",
      USD: "",
      EUR: "",
      Category: "Misc",
      WhoSpent: "ivan@example.com",
      ForWhom: "",
      Comment: "",
      PaymentChannel: "",
      Theme: "",
    });

    expect(errors.PLN).toContain("Only one of PLN, BYN, or EUR");
    expect(errors.BYN).toContain("Only one of PLN, BYN, or EUR");
    expect(errors.EUR).toBeUndefined();
  });

  it("allows a single non-USD amount together with USD", () => {
    const errors = validateExpenseDraft({
      Date: "2026-03-14",
      PLN: "10.25",
      BYN: "",
      USD: "2.80",
      EUR: "",
      Category: "Misc",
      WhoSpent: "ivan@example.com",
      ForWhom: "",
      Comment: "",
      PaymentChannel: "",
      Theme: "",
    });

    expect(errors).toEqual({});
  });

  it("accepts positive FX rates with comma or dot separator", () => {
    expect(parsePositiveDecimal("3.25")).toBe(3.25);
    expect(parsePositiveDecimal("3,25")).toBe(3.25);
  });
});
