// @vitest-environment node

let validateMappingRequestBody;
let validateUsdMandatory;
let validateRequiredFields;

beforeAll(async () => {
  ({ validateMappingRequestBody, validateUsdMandatory, validateRequiredFields } = await import("../../app-server/validation.js"));
});

describe("validateMappingRequestBody", () => {
  it("rejects missing confirmed flag", () => {
    const result = validateMappingRequestBody({ mapping: { USD: "Amount" } });
    expect(result.valid).toBe(false);
    expect(result.message).toContain("confirmation");
  });

  it("rejects missing mapping", () => {
    const result = validateMappingRequestBody({ confirmed: true });
    expect(result.valid).toBe(false);
    expect(result.message).toContain("mapping");
  });

  it("accepts valid body", () => {
    expect(validateMappingRequestBody({ confirmed: true, mapping: {} })).toEqual({ valid: true });
  });
});

describe("validateUsdMandatory", () => {
  // Canonical values order: [date, ...currencies, usd, ...]
  // With sheetCurrencies = ["PLN"], values are [date, PLN, USD, ...]

  it("returns null when no currencies configured (USD-only sheet)", () => {
    const result = validateUsdMandatory(["2026-06-09", "50", "Misc", "user", ""], []);
    expect(result).toBeNull();
  });

  it("returns null when non-USD amount is empty", () => {
    // PLN empty, USD filled
    const result = validateUsdMandatory(["2026-06-09", "", "50", "Misc", "user", ""], ["PLN"]);
    expect(result).toBeNull();
  });

  it("returns null when non-USD and USD are both filled", () => {
    // PLN=400, USD=10
    const result = validateUsdMandatory(["2026-06-09", "400", "10", "Misc", "user", ""], ["PLN"]);
    expect(result).toBeNull();
  });

  it("returns error message when non-USD filled but USD is empty", () => {
    // PLN=400, USD=""
    const result = validateUsdMandatory(["2026-06-09", "400", "", "Misc", "user", ""], ["PLN"]);
    expect(result).toBeTruthy();
    expect(result).toContain("USD");
  });

  it("returns error message when non-USD filled but USD is zero", () => {
    // PLN=400, USD=0
    const result = validateUsdMandatory(["2026-06-09", "400", "0", "Misc", "user", ""], ["PLN"]);
    expect(result).toBeTruthy();
  });

  it("returns null for negative non-USD amounts (refund) with USD filled", () => {
    // PLN=-100, USD=-2.50
    const result = validateUsdMandatory(["2026-06-09", "-100", "-2.50", "Misc", "user", ""], ["PLN"]);
    expect(result).toBeNull();
  });

  it("handles multiple currencies, fires when any non-USD is filled without USD", () => {
    // PLN empty, EUR=5, USD empty — sheetCurrencies = ["PLN", "EUR"]
    // values: [date, PLN, EUR, USD, ...]
    const result = validateUsdMandatory(["2026-06-09", "", "5", "", "Misc", "user", ""], ["PLN", "EUR"]);
    expect(result).toBeTruthy();
  });

  it("accepts comma as decimal separator in non-USD amount", () => {
    // PLN="400,00" (comma separator), USD=""
    const result = validateUsdMandatory(["2026-06-09", "400,00", "", "Misc", "user", ""], ["PLN"]);
    expect(result).toBeTruthy();
  });
});

describe("validateRequiredFields", () => {
  // Canonical values order: [date, ...currencies, usd, category, spentBy, spentFor, comment, ...]
  // With sheetCurrencies = [], values are [date, usd, category, spentBy, spentFor, comment]

  it("returns null when Category, Spent By, and Spent For are all present", () => {
    const result = validateRequiredFields(["2026-06-09", "50", "Food", "ivan", "family", ""], []);
    expect(result).toBeNull();
  });

  it("returns an error when Category is missing", () => {
    const result = validateRequiredFields(["2026-06-09", "50", "", "ivan", "family", ""], []);
    expect(result).toBe("Category is required.");
  });

  it("returns an error when Spent By is missing", () => {
    const result = validateRequiredFields(["2026-06-09", "50", "Food", "", "family", ""], []);
    expect(result).toBe("Spent By is required.");
  });

  it("returns an error when Spent For is missing", () => {
    const result = validateRequiredFields(["2026-06-09", "50", "Food", "ivan", "", ""], []);
    expect(result).toBe("Spent For is required.");
  });

  it("treats whitespace-only values as missing", () => {
    const result = validateRequiredFields(["2026-06-09", "50", "Food", "ivan", "   ", ""], []);
    expect(result).toBe("Spent For is required.");
  });

  it("accounts for sheetCurrencies offset when locating fixed columns", () => {
    // sheetCurrencies = ["PLN", "EUR"] shifts USD/Category/SpentBy/SpentFor by 2
    const result = validateRequiredFields(["2026-06-09", "400", "", "50", "Food", "ivan", "family", ""], ["PLN", "EUR"]);
    expect(result).toBeNull();
  });
});
