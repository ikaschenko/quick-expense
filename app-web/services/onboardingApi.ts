import { requestNoContent } from "./http";

export const onboardingApi = {
  async markTourSeen(): Promise<void> {
    await requestNoContent("/api/onboarding/tour-seen", { method: "POST" });
  },
};
