import { AddShareRequest, ShareEntry } from "../types/expense";
import { requestJson, requestNoContent } from "./http";

export const sharingApi = {
  async listShares(): Promise<ShareEntry[]> {
    const response = await requestJson<{ shares: ShareEntry[] }>("/api/sharing");
    return response.shares;
  },

  async addShare(req: AddShareRequest): Promise<ShareEntry> {
    return requestJson<ShareEntry>("/api/sharing", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  async updateShare(guestEmail: string, accessLevel: 'view' | 'edit'): Promise<ShareEntry> {
    return requestJson<ShareEntry>(`/api/sharing/${encodeURIComponent(guestEmail)}`, {
      method: "PATCH",
      body: JSON.stringify({ accessLevel }),
    });
  },

  async removeShare(guestEmail: string): Promise<void> {
    await requestNoContent(`/api/sharing/${encodeURIComponent(guestEmail)}`, {
      method: "DELETE",
    });
  },

  async resetGuestConfig(): Promise<void> {
    await requestNoContent("/api/sharing/guest/reset", {
      method: "POST",
    });
  },
};
