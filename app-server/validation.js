/**
 * Validates the request body for POST /api/config/mapping.
 * Returns { valid: true } or { valid: false, message: string }.
 */
export function validateMappingRequestBody(body) {
  if (body?.confirmed !== true) {
    return { valid: false, message: "Explicit confirmation is required to save a column mapping." };
  }
  const mapping = body?.mapping;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return { valid: false, message: "A mapping object is required." };
  }
  return { valid: true };
}

/**
 * AC-9: Ensures that if any non-USD currency amount is filled, USD must also be provided.
 * @param {string[]} values - Canonical row values array [date, ...currencies, usd, ...].
 * @param {string[]} sheetCurrencies - Non-USD currency codes in sheet order.
 * @returns {string | null} Error message, or null if valid.
 */
export function validateUsdMandatory(values, sheetCurrencies) {
  if (!sheetCurrencies.length) return null;

  const usdIndex = 1 + sheetCurrencies.length;
  const usdRaw = String(values[usdIndex] ?? "").replace(",", ".").trim();
  const usdValue = Number.parseFloat(usdRaw);

  const hasNonUsdAmount = sheetCurrencies.some((_, i) => {
    const raw = String(values[1 + i] ?? "").replace(",", ".").trim();
    const n = Number.parseFloat(raw);
    return raw !== "" && !Number.isNaN(n) && n !== 0;
  });

  if (hasNonUsdAmount && (!usdRaw || Number.isNaN(usdValue) || usdValue === 0)) {
    return "USD amount is required when a non-USD currency amount is provided.";
  }

  return null;
}

/**
 * Ensures Category, Spent By, and Spent For are non-empty.
 * @param {string[]} values - Canonical row values array [date, ...currencies, usd, category, spentBy, spentFor, comment, ...].
 * @param {string[]} sheetCurrencies - Non-USD currency codes in sheet order.
 * @returns {string | null} Error message, or null if valid.
 */
export function validateRequiredFields(values, sheetCurrencies) {
  const fixedStart = 1 + sheetCurrencies.length;
  const category = String(values[fixedStart + 1] ?? "").trim();
  const spentBy = String(values[fixedStart + 2] ?? "").trim();
  const spentFor = String(values[fixedStart + 3] ?? "").trim();

  if (!category) return "Category is required.";
  if (!spentBy) return "Spent By is required.";
  if (!spentFor) return "Spent For is required.";

  return null;
}
