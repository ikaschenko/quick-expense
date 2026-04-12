import { AppError, HeaderDetails } from "../types/expense";

const FETCH_TIMEOUT_MS = 15_000;

function createTimeoutAbortController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  return controller;
}

function getFriendlyErrorMessage(error: unknown): string {
  if (!navigator.onLine) {
    return "No internet connection. Please check your connection and try again.";
  }
  
  if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
    return "Unable to connect to the server. Please check your connection and try again.";
  }
  
  return "Request failed. Please try again.";
}

export async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const controller = createTimeoutAbortController(FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(input, {
      credentials: "include",
      ...init,
      signal: controller.signal,
      headers: {
        "X-Requested-With": "fetch",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      let message = "Request failed.";
      let headerDetails: HeaderDetails | undefined;

      try {
        const payload = (await response.json()) as { message?: string; headerDetails?: HeaderDetails };
        if (payload.message) {
          message = payload.message;
        }
        if (payload.headerDetails) {
          headerDetails = payload.headerDetails;
        }
      } catch {
        // Ignore parse failure.
      }

      throw new AppError(
        response.status === 401
          ? "authentication"
          : response.status === 400
            ? "validation"
          : response.status === 403
            ? "authorization"
            : "network",
        message,
        headerDetails,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) {
      throw error; // Re-throw our known error type
    }
    
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[http.ts requestJson] Request timeout after 15s:", input);
      throw new AppError("network", "Request timed out. Please check your connection and try again.");
    }
    
    // Handle generic network errors (including "Failed to fetch")
    const friendlyMessage = getFriendlyErrorMessage(error);
    console.warn("[http.ts requestJson] Network error:", input, error);
    throw new AppError("network", friendlyMessage);
  }
}

export async function requestNoContent(input: string, init?: RequestInit): Promise<void> {
  const controller = createTimeoutAbortController(FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(input, {
      credentials: "include",
      ...init,
      signal: controller.signal,
      headers: {
        "X-Requested-With": "fetch",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      let message = "Request failed.";

      try {
        const payload = (await response.json()) as { message?: string };
        if (payload.message) {
          message = payload.message;
        }
      } catch {
        // Ignore parse failure.
      }

      throw new AppError(
        response.status === 401
          ? "authentication"
          : response.status === 400
            ? "validation"
          : response.status === 403
            ? "authorization"
            : "network",
        message,
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error; // Re-throw our known error type
    }
    
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[http.ts requestNoContent] Request timeout after 15s:", input);
      throw new AppError("network", "Request timed out. Please check your connection and try again.");
    }
    
    // Handle generic network errors (including "Failed to fetch")
    const friendlyMessage = getFriendlyErrorMessage(error);
    console.warn("[http.ts requestNoContent] Network error:", input, error);
    throw new AppError("network", friendlyMessage);
  }
}
