import { AppError, HeaderDetails } from "../types/expense";

export async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
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
}

export async function requestNoContent(input: string, init?: RequestInit): Promise<void> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
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
}
