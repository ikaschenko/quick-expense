import { buildTourSteps, computeTourScrollDelta, filterAvailableSteps, tourVariantFromOrigin, type TourStepId } from "../../app-web/utils/onboardingTour";

describe("buildTourSteps", () => {
  it("should return the five steps in agreed order for a new sheet", () => {
    const steps = buildTourSteps({ variant: "new_sheet", hasExpenses: false, isReplay: false });

    expect(steps.map((step) => step.id)).toEqual(["currencies", "spent-fields-visibility", "custom-columns", "sharing", "add-nav"]);
    expect(steps[0].description).toContain("sample currencies");
    expect(steps[2].description).toContain("remove these sample ones");
    expect(steps.slice(0, 4).every((step) => step.ending === undefined)).toBe(true);
  });

  it("should use existing-sheet wording for currencies and extra fields", () => {
    const steps = buildTourSteps({ variant: "existing_sheet", hasExpenses: false, isReplay: false });

    expect(steps[0].description).toBe("These are the currencies found in your sheet. Add or remove any anytime.");
    expect(steps[2].description).toContain("remove fields you don't need");
  });

  it.each([
    ["new sheet", "new_sheet", false, false, "add-expense", "Add my first expense"],
    ["new sheet even when expenses exist", "new_sheet", true, false, "add-expense", "Add my first expense"],
    ["existing empty sheet", "existing_sheet", false, false, "add-expense", "Add my first expense"],
    ["existing sheet with expenses", "existing_sheet", true, false, "done", "Done"],
    ["replay of a new sheet", "new_sheet", false, true, "done", "Done"],
    ["replay of an existing empty sheet", "existing_sheet", false, true, "done", "Done"],
  ] as const)("should end the %s tour with %s", (_label, variant, hasExpenses, isReplay, ending, doneLabel) => {
    const last = buildTourSteps({ variant, hasExpenses, isReplay }).at(-1)!;

    expect(last).toMatchObject({ id: "add-nav", ending, doneLabel });
    expect(last.description).toBe(ending === "done" ? "You're all set. Tap + whenever you spend." : "You're all set! Let's add your first expense.");
  });
});

describe("filterAvailableSteps", () => {
  const steps = buildTourSteps({ variant: "new_sheet", hasExpenses: false, isReplay: false });

  it("should keep every step when all controls are present", () => {
    expect(filterAvailableSteps(steps, () => true)).toHaveLength(5);
  });

  it("should drop steps whose control is missing so the count adjusts", () => {
    const missing = new Set<TourStepId>(["currencies", "custom-columns"]);

    const result = filterAvailableSteps(steps, (id) => !missing.has(id));

    expect(result.map((step) => step.id)).toEqual(["spent-fields-visibility", "sharing", "add-nav"]);
  });

  it("should return an empty list when no control is present", () => {
    expect(filterAvailableSteps(steps, () => false)).toEqual([]);
  });
});

describe("computeTourScrollDelta", () => {
  const viewport = { viewportHeight: 800, topInset: 56, bottomInset: 64 };

  it.each([
    ["target and popover already between the bars", 300, 40, 0],
    ["target hidden under the topbar", 20, 40, -226],
    ["target hidden under the bottom nav", 700, 40, 454],
    ["target visible but its popover would not fit below", 600, 40, 354],
    ["target taller than the visible area, aligned to the top", 500, 900, 432],
  ])("should handle %s", (_label, targetTop, targetHeight, expected) => {
    expect(computeTourScrollDelta({ ...viewport, targetTop, targetHeight })).toBe(expected);
  });
});

describe("tourVariantFromOrigin", () => {
  it.each([
    ["created", "new_sheet"],
    ["existing", "existing_sheet"],
    ["unknown", "existing_sheet"],
    [null, "existing_sheet"],
    [undefined, "existing_sheet"],
  ] as const)("should map origin %s to %s", (origin, variant) => {
    expect(tourVariantFromOrigin(origin)).toBe(variant);
  });
});
