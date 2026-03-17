import { AuthSession } from "../types/expense";
import { requestJson, requestNoContent } from "./http";

interface SessionResponse {
  authenticated: boolean;
  session?: AuthSession;
}

export const authApi = {
  async getSession(): Promise<AuthSession | null> {
    const response = await requestJson<SessionResponse>("/api/auth/session");
    return response.authenticated ? response.session ?? null : null;
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
