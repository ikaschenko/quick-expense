import logger from "./logger.js";

const FX_TIMEOUT_MS = 5_000;
const MAX_LOOKBACK_DAYS = 5;

/** jsDelivr is tried first; currency-api.pages.dev is the provider's documented Cloudflare fallback. */
function buildFxUrls(date) {
  return [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.json`,
  ];
}

function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FX_TIMEOUT_MS);
  try {
    logger.info("fx_api_request", { event: "fx_api_request", url });
    const response = await fetch(url, { signal: controller.signal });
    const responseText = await response.text();
    logger.info("fx_api_response", {
      event: "fx_api_response",
      url,
      statusCode: response.status,
      responseBody: responseText,
    });
    if (!response.ok) return null;
    return JSON.parse(responseText);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Tries jsDelivr then the Cloudflare fallback host for a single date. Returns parsed JSON or null. */
export async function fetchFxDataForDate(date) {
  for (const url of buildFxUrls(date)) {
    const data = await fetchJson(url);
    if (data) return data;
  }
  return null;
}

/**
 * Resolves live FX rates for the requested currencies/date.
 * When a specific date is requested, walks backward up to maxLookbackDays if that date
 * has no published data yet (same-day publish lag, weekends, holidays).
 * Returns { rates, date } (date is the actually-resolved date) or null if every attempt failed.
 */
export async function resolveFxRates({ currencies, date, maxLookbackDays = MAX_LOOKBACK_DAYS }) {
  const isDated = Boolean(date);
  const attempts = isDated ? maxLookbackDays + 1 : 1;
  const requestedDate = date || "latest";

  let cursor = requestedDate;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const data = await fetchFxDataForDate(cursor);
    if (data) {
      const usdRates = data?.usd ?? {};
      const rates = {};
      for (const code of currencies) {
        const value = usdRates[code.toLowerCase()];
        if (typeof value === "number") rates[code] = value;
      }
      const resolvedDate = data?.date ?? cursor;
      if (resolvedDate !== requestedDate) {
        logger.warn("fx_api_fallback_date_used", {
          event: "fx_api_fallback_date_used",
          requestedDate,
          resolvedDate,
        });
      }
      return { rates, date: resolvedDate };
    }
    if (!isDated) break;
    cursor = shiftDate(cursor, -1);
  }

  logger.warn("fx_api_exhausted", { event: "fx_api_exhausted", requestedDate, attempts });
  return null;
}
