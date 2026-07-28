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
