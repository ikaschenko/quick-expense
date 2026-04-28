import { parsePositiveDecimal, validateExpenseDraft } from "../src/utils/validation";

const ACTIVE_CURRENCIES = ["PLN", "BYN", "EUR"];

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    Date: "",
    USD: "",
    Category: "",
    WhoSpent: "",
    ForWhom: "",
    Comment: "",
    PaymentChannel: "",
    Theme: "",
    currencyAmounts: { PLN: "", BYN: "", EUR: "" },
    ...overrides,
  };
}

describe("expense validation", () => {
  it("requires date, at least one currency, category, and WhoSpent", () => {
    const errors = validateExpenseDraft(makeDraft(), ACTIVE_CURRENCIES);

    expect(errors.Date).toContain("YYYY-MM-DD");
    expect(errors.USD).toContain("at least one");
    expect(errors.Category).toContain("required");
    expect(errors.WhoSpent).toContain("required");
  });

  it("accepts valid decimal currency fields", () => {
    const errors = validateExpenseDraft(
      makeDraft({
        Date: "2026-03-14",
        Category: "Misc",
        WhoSpent: "ivan@example.com",
        currencyAmounts: { PLN: "-10.25", BYN: "", EUR: "" },
      }),
      ACTIVE_CURRENCIES,
    );

    expect(errors).toEqual({});
  });

  it("rejects submitting more than one non-USD currency amount", () => {
    const errors = validateExpenseDraft(
      makeDraft({
        Date: "2026-03-14",
        Category: "Misc",
        WhoSpent: "ivan@example.com",
        currencyAmounts: { PLN: "10.25", BYN: "5", EUR: "" },
      }),
      ACTIVE_CURRENCIES,
    );

    expect(errors.PLN).toContain("Only one of");
    expect(errors.BYN).toContain("Only one of");
    expect(errors.EUR).toBeUndefined();
  });

  it("allows a single non-USD amount together with USD", () => {
    const errors = validateExpenseDraft(
      makeDraft({
        Date: "2026-03-14",
        USD: "2.80",
        Category: "Misc",
        WhoSpent: "ivan@example.com",
        currencyAmounts: { PLN: "10.25", BYN: "", EUR: "" },
      }),
      ACTIVE_CURRENCIES,
    );

    expect(errors).toEqual({});
  });

  it("works with zero active currencies (USD-only mode)", () => {
    const errors = validateExpenseDraft(
      makeDraft({
        Date: "2026-03-14",
        USD: "5.00",
        Category: "Misc",
        WhoSpent: "ivan@example.com",
        currencyAmounts: {},
      }),
      [],
    );

    expect(errors).toEqual({});
  });

  it("accepts positive FX rates with comma or dot separator", () => {
    expect(parsePositiveDecimal("3.25")).toBe(3.25);
    expect(parsePositiveDecimal("3,25")).toBe(3.25);
  });
});
