import { detectDateFormat, formatLocalDate, getDateShortcutRanges } from "../../app-web/utils/date";

describe("detectDateFormat", () => {
  it("returns null for empty samples", () => {
    expect(detectDateFormat([])).toBeNull();
  });

  it("returns null for all-blank samples", () => {
    expect(detectDateFormat(["", "  "])).toBeNull();
  });

  it("returns null when all days are ambiguous (≤ 12)", () => {
    // Cannot distinguish mm/dd from dd/mm
    expect(detectDateFormat(["01/02/2024", "03/04/2024"])).toBeNull();
  });

  describe("mm/dd/yyyy (slash, year-last, month-first)", () => {
    it.each([
      [["04/15/2024"], new Date(2026, 5, 4), "06/04/2026"],
      [["12/25/2023", "01/01/2024"], new Date(2026, 0, 1), "01/01/2026"],
    ])("formats today correctly from samples %#", (samples, today, expected) => {
      const fmt = detectDateFormat(samples);
      expect(fmt).not.toBeNull();
      expect(fmt!.toSheet(today)).toBe(expected);
    });
  });

  describe("dd/mm/yyyy (slash, year-last, day-first)", () => {
    it.each([
      [["25/04/2024"], new Date(2026, 5, 4), "04/06/2026"],
      [["31/01/2024"], new Date(2026, 0, 15), "15/01/2026"],
    ])("formats today correctly from samples %#", (samples, today, expected) => {
      const fmt = detectDateFormat(samples);
      expect(fmt).not.toBeNull();
      expect(fmt!.toSheet(today)).toBe(expected);
    });
  });

  describe("yyyy-mm-dd (dash, year-first, month-first)", () => {
    it("detects ISO format when a day > 12 is present", () => {
      const fmt = detectDateFormat(["2024-03-25"]);
      expect(fmt).not.toBeNull();
      expect(fmt!.toSheet(new Date(2026, 5, 4))).toBe("2026-06-04");
    });
  });

  describe("dd.mm.yyyy (dot, year-last, day-first)", () => {
    it("detects dot-separated European format", () => {
      const fmt = detectDateFormat(["25.04.2024"]);
      expect(fmt).not.toBeNull();
      expect(fmt!.toSheet(new Date(2026, 5, 4))).toBe("04.06.2026");
    });
  });

  it("ignores inconsistent separators and uses the first consistent one", () => {
    // Second sample has a different separator — should be ignored
    const fmt = detectDateFormat(["01/02/2024", "25-04-2024"]);
    // First sample is ambiguous, second has inconsistent separator — overall null
    expect(fmt).toBeNull();
  });

  it("resolves ambiguity across multiple samples", () => {
    // First sample is ambiguous (day 05 ≤ 12), second disambiguates (day 25)
    const fmt = detectDateFormat(["01/05/2024", "01/25/2024"]);
    expect(fmt).not.toBeNull();
    // day > 12 is in position [1] → month-first (mm/dd/yyyy)
    expect(fmt!.toSheet(new Date(2026, 5, 4))).toBe("06/04/2026");
  });

  it("returns formatLocalDate-equivalent output for yyyy-mm-dd sheets", () => {
    const fmt = detectDateFormat(["2024-01-25"]);
    const date = new Date(2026, 5, 4);
    expect(fmt!.toSheet(date)).toBe(formatLocalDate(date));
  });

  describe("unpadded (single-digit) month/day", () => {
    it("detects unpadded m/d/yyyy and formats without leading zeroes", () => {
      // Historical sheet dates like 6/3/2026 — no zero padding
      const fmt = detectDateFormat(["4/15/2024"]);
      expect(fmt).not.toBeNull();
      expect(fmt!.toSheet(new Date(2026, 5, 9))).toBe("6/9/2026");
    });

    it("detects unpadded d/m/yyyy and formats without leading zeroes", () => {
      const fmt = detectDateFormat(["25/4/2024"]);
      expect(fmt).not.toBeNull();
      expect(fmt!.toSheet(new Date(2026, 5, 9))).toBe("9/6/2026");
    });

    it("resolves padding from second sample when first has all values ≥ 10", () => {
      // First sample: 12/25/2023 — both non-year parts ≥ 10, can't tell padding
      // Second sample: 1/3/2024 — non-year part < 10, length 1 → unpadded
      const fmt = detectDateFormat(["12/25/2023", "1/3/2024"]);
      expect(fmt).not.toBeNull();
      expect(fmt!.toSheet(new Date(2026, 5, 9))).toBe("6/9/2026");
    });

    it("round-trips unpadded toSheet then toIso back to ISO", () => {
      const fmt = detectDateFormat(["4/15/2024"]);
      expect(fmt!.toIso(fmt!.toSheet(new Date(2026, 5, 9)))).toBe("2026-06-09");
    });
  });

  describe("toIso (sheet date → ISO round-trip)", () => {
    it("parses mm/dd/yyyy back to ISO", () => {
      const fmt = detectDateFormat(["04/15/2024"]);
      expect(fmt!.toIso("06/04/2026")).toBe("2026-06-04");
    });

    it("parses dd/mm/yyyy back to ISO", () => {
      const fmt = detectDateFormat(["25/04/2024"]);
      expect(fmt!.toIso("04/06/2026")).toBe("2026-06-04");
    });

    it("parses dd.mm.yyyy back to ISO", () => {
      const fmt = detectDateFormat(["25.04.2024"]);
      expect(fmt!.toIso("04.06.2026")).toBe("2026-06-04");
    });

    it("returns null for a string that does not match the separator", () => {
      const fmt = detectDateFormat(["04/15/2024"]);
      expect(fmt!.toIso("2026-06-04")).toBeNull();
    });

    it("round-trips toSheet then toIso back to the original ISO date", () => {
      const fmt = detectDateFormat(["04/15/2024"]);
      expect(fmt!.toIso(fmt!.toSheet(new Date(2026, 5, 4)))).toBe("2026-06-04");
    });
  });
});

describe("getDateShortcutRanges", () => {
  it("computes correct shortcut ranges for Saturday Sep 12, 2026", () => {
    const ref = new Date(2026, 8, 12); // Sep 12, 2026
    const ranges = getDateShortcutRanges(ref);

    // Last 7d (-7d ago)
    expect(ranges.last7d).toEqual({ dateFrom: "2026-09-05", dateTo: "" });

    // Last 30d (-30d ago)
    expect(ranges.last30d).toEqual({ dateFrom: "2026-08-13", dateTo: "" });

    // Last week (Mon Aug 31 to Sun Sep 6)
    expect(ranges.lastWeek).toEqual({ dateFrom: "2026-08-31", dateTo: "2026-09-06" });

    // Last month (Aug 1 to Aug 31)
    expect(ranges.lastMonth).toEqual({ dateFrom: "2026-08-01", dateTo: "2026-08-31" });
  });

  it("handles year rollover for Last Month when refDate is in January", () => {
    const ref = new Date(2026, 0, 15); // Jan 15, 2026
    const ranges = getDateShortcutRanges(ref);

    expect(ranges.lastMonth).toEqual({ dateFrom: "2025-12-01", dateTo: "2025-12-31" });
  });

  it("handles Last Week when refDate is a Sunday or Monday", () => {
    // Sunday Sep 13, 2026 -> last week is Mon Aug 31 to Sun Sep 6
    const sunRef = new Date(2026, 8, 13);
    expect(getDateShortcutRanges(sunRef).lastWeek).toEqual({ dateFrom: "2026-08-31", dateTo: "2026-09-06" });

    // Monday Sep 7, 2026 -> last week is Mon Aug 31 to Sun Sep 6
    const monRef = new Date(2026, 8, 7);
    expect(getDateShortcutRanges(monRef).lastWeek).toEqual({ dateFrom: "2026-08-31", dateTo: "2026-09-06" });
  });
});
