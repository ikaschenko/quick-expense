import { act, renderHook } from "@testing-library/react";
import type { Config } from "driver.js";
import { useOnboardingTour, type StartTourOptions } from "../../app-web/hooks/useOnboardingTour";
import { trackEvent } from "../../app-web/services/analytics";

const mocks = vi.hoisted(() => ({
  config: null as Config | null,
  drive: vi.fn(),
  destroy: vi.fn(),
  navigate: vi.fn(),
  markSeen: vi.fn(),
}));

vi.mock("driver.js", () => ({
  driver: (config: Config) => {
    mocks.config = config;
    return { drive: mocks.drive, destroy: mocks.destroy, isActive: () => false };
  },
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("../../app-web/contexts/AuthContext", () => ({ useAuth: () => ({ markOnboardingTourSeen: mocks.markSeen }) }));
vi.mock("../../app-web/services/analytics", () => ({ trackEvent: vi.fn() }));

const ALL_TARGETS = ["currencies", "spent-fields-visibility", "custom-columns", "sharing", "add-nav"];

function renderTargets(targets: string[]): void {
  document.body.innerHTML = targets.map((id) => `<div data-tour="${id}"></div>`).join("");
}

function startTour(options: StartTourOptions): boolean {
  const { result } = renderHook(() => useOnboardingTour());
  let started = false;
  act(() => { started = result.current.start(options); });
  return started;
}

function finish(reason: "done" | "close" | "escape", index = 0): void {
  mocks.config!.onHighlighted?.(undefined, {}, { index } as never);
  mocks.config!.onDestroyed?.(undefined, {}, { reason } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = null;
  renderTargets(ALL_TARGETS);
});

describe("useOnboardingTour", () => {
  it("should not start when no step target is on screen", () => {
    renderTargets([]);

    expect(startTour({ variant: "new_sheet", trigger: "auto", hasExpenses: false })).toBe(false);
    expect(mocks.drive).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("should skip missing targets and report the adjusted step count", () => {
    renderTargets(["currencies", "sharing", "add-nav"]);

    startTour({ variant: "new_sheet", trigger: "auto", hasExpenses: false });

    expect(mocks.config!.steps!.map((step) => step.element)).toEqual(['[data-tour="currencies"]', '[data-tour="sharing"]', '[data-tour="add-nav"]']);
    expect(mocks.config!.progressText).toBe("{{current}} of {{total}}");
    expect(trackEvent).toHaveBeenCalledWith("onboarding_tour_started", { trigger: "auto", path: "new_sheet", total_steps: 3 });
  });

  it("should complete, persist the seen flag, and open Add when the first-expense button is pressed", () => {
    startTour({ variant: "new_sheet", trigger: "auto", hasExpenses: false });
    expect(mocks.config!.steps!.at(-1)!.popover!.doneBtnText).toBe("Add my first expense");

    mocks.config!.onDoneClick?.(undefined, {}, {} as never);
    finish("close", 4);

    expect(mocks.destroy).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/add");
    expect(trackEvent).toHaveBeenCalledWith("onboarding_tour_completed", { trigger: "auto", path: "new_sheet" });
    expect(mocks.markSeen).toHaveBeenCalledOnce();
  });

  it.each(["close", "escape"] as const)("should record a skip at the current step on %s and persist the seen flag", (reason) => {
    startTour({ variant: "existing_sheet", trigger: "auto", hasExpenses: true });

    finish(reason, 1);

    expect(trackEvent).toHaveBeenCalledWith("onboarding_tour_skipped", { step_id: "spent-fields-visibility", step_index: 2 });
    expect(mocks.markSeen).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("should end a replay with Done, stay on Setup, and leave the seen flag untouched", () => {
    startTour({ variant: "new_sheet", trigger: "replay", hasExpenses: false });
    expect(mocks.config!.steps!.at(-1)!.popover!.doneBtnText).toBe("Done");

    mocks.config!.onDoneClick?.(undefined, {}, {} as never);
    finish("done", 4);

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("onboarding_tour_completed", { trigger: "replay", path: "new_sheet" });
    expect(mocks.markSeen).not.toHaveBeenCalled();
  });

  it("should scroll a target hidden under the topbar and leave fixed-bar targets alone", () => {
    document.body.innerHTML = '<header class="topbar"></header><div data-tour="currencies" id="t"></div><nav class="bottom-nav"><a data-tour="add-nav" id="n"></a></nav>';
    const rect = (top: number, height: number) => ({ top, height, bottom: top + height }) as DOMRect;
    vi.spyOn(document.querySelector(".topbar")!, "getBoundingClientRect").mockReturnValue(rect(0, 56));
    vi.spyOn(document.querySelector(".bottom-nav")!, "getBoundingClientRect").mockReturnValue(rect(736, 64));
    vi.spyOn(document.getElementById("t")!, "getBoundingClientRect").mockReturnValue(rect(20, 40));
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    vi.stubGlobal("innerHeight", 800);
    startTour({ variant: "new_sheet", trigger: "auto", hasExpenses: false });
    expect(mocks.config!.scrollIntoView).toBe(false);

    mocks.config!.onHighlightStarted?.(document.getElementById("t")!, {}, {} as never);
    expect(scrollBy).toHaveBeenCalledWith(0, -226);

    scrollBy.mockClear();
    mocks.config!.onHighlightStarted?.(document.getElementById("n")!, {}, {} as never);
    expect(scrollBy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("should track each viewed step with a 1-based index", () => {
    startTour({ variant: "new_sheet", trigger: "auto", hasExpenses: false });

    mocks.config!.onHighlighted?.(undefined, {}, { index: 2 } as never);

    expect(trackEvent).toHaveBeenCalledWith("onboarding_tour_step_viewed", { step_id: "custom-columns", step_index: 3, total_steps: 5 });
  });
});
