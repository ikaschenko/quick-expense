import type { AdminUsageMetrics } from "../types/expense";
import { requestJson } from "./http";

export const adminApi = {
  getUsageMetrics(): Promise<AdminUsageMetrics> {
    return requestJson<AdminUsageMetrics>("/api/admin/metrics", { cache: "no-store" });
  },
};
