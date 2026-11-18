import { formatCoverageGap, formatGapDuration } from "../../app-web/utils/coverageGap";

describe("formatGapDuration", () => {
  it.each([
    ["2026-10-24T09:00:00Z", "2026-10-24T09:00:00.900Z", "00s"],
    ["2026-10-24T09:00:00Z", "2026-10-24T09:00:07Z", "07s"],
    ["2026-10-24T09:00:00Z", "2026-10-24T09:05:17Z", "05m:17s"],
    ["2026-10-24T09:00:00Z", "2026-10-24T10:00:00Z", "01h:00m:00s"],
    ["2026-10-24T00:00:00Z", "2026-10-24T15:00:07Z", "15h:00m:07s"],
    ["2026-10-24T00:00:00Z", "2026-10-24T15:12:07.999Z", "15h:12m:07s"],
    ["2026-10-24T09:00:00Z", "2026-10-26T09:00:00Z", "48h:00m:00s"],
    ["2026-10-24T09:00:10Z", "2026-10-24T09:00:00Z", "00s"],
  ])("%s → %s = %s", (start, end, expected) => {
    expect(formatGapDuration(start, end)).toBe(expected);
  });
});

describe("formatCoverageGap", () => {
  it("drops the date from the end when both points share a UTC date", () => {
    expect(formatCoverageGap({ start: "2026-10-24T09:45:07.204Z", end: "2026-10-24T09:45:48.209Z" }))
      .toBe("2026-10-24T09:45:07.204Z – 09:45:48.209Z, 41s");
  });

  it("keeps the full end timestamp when the gap crosses midnight", () => {
    expect(formatCoverageGap({ start: "2026-10-24T23:59:00Z", end: "2026-10-25T00:01:00Z" }))
      .toBe("2026-10-24T23:59:00.000Z – 2026-10-25T00:01:00.000Z, 02m:00s");
  });
});
