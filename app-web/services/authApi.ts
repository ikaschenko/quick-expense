import { AuthSession } from "../types/expense";
import { requestJson, requestNoContent } from "./http";

interface SessionResponse {
  authenticated: boolean;
  session?: AuthSession;
}

export const authApi = {
  async getSession(): Promise<AuthSession | null> {
    const response = await requestJson<SessionResponse>("/api/auth/session");
    if (!response.authenticated || !response.session) return null;
    // Apply defaults for sharing fields in case backend is not yet deployed.
    return {
      ...response.session,
      isGuest: response.session.isGuest ?? false,
      guestAccessLevel: response.session.guestAccessLevel ?? null,
      ownerEmail: response.session.ownerEmail ?? null,
      configStatus: response.session.configStatus ?? "ok",
    };
  },

  startLogin(): void {
    window.location.assign("/api/auth/login");
  },

  async logout(): Promise<void> {
    await requestNoContent("/api/auth/logout", {
      method: "POST",
    });
  },
};
