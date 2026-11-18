import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { driver, type Driver } from "driver.js";
import { useAuth } from "../contexts/AuthContext";
import { trackEvent } from "../services/analytics";
import {
  buildTourSteps,
  computeTourScrollDelta,
  filterAvailableSteps,
  type TourStepId,
  type TourTrigger,
  type TourVariant,
} from "../utils/onboardingTour";

export interface StartTourOptions {
  variant: TourVariant;
  trigger: TourTrigger;
  hasExpenses: boolean;
}

const selectorFor = (id: TourStepId): string => `[data-tour="${id}"]`;

/** driver.js ignores the fixed topbar and bottom nav, so the target is scrolled between them here. */
function scrollTargetIntoView(element: Element | undefined): void {
  if (!element || element.closest(".topbar, .bottom-nav")) return;
  const rect = element.getBoundingClientRect();
  const delta = computeTourScrollDelta({
    targetTop: rect.top,
    targetHeight: rect.height,
    viewportHeight: window.innerHeight,
    topInset: document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0,
    bottomInset: window.innerHeight - (document.querySelector(".bottom-nav")?.getBoundingClientRect().top ?? window.innerHeight),
  });
  if (delta !== 0) window.scrollBy(0, delta);
}

/** Wraps driver.js for the Setup onboarding tour. `start` returns false when no step target is on screen. */
export function useOnboardingTour(): { start: (options: StartTourOptions) => boolean } {
  const navigate = useNavigate();
  const { markOnboardingTourSeen } = useAuth();
  const navigateRef = useRef(navigate);
  const markSeenRef = useRef(markOnboardingTourSeen);
  const driverRef = useRef<Driver | null>(null);
  navigateRef.current = navigate;
  markSeenRef.current = markOnboardingTourSeen;

  useEffect(() => () => driverRef.current?.destroy(), []);

  const start = useCallback(({ variant, trigger, hasExpenses }: StartTourOptions): boolean => {
    if (driverRef.current?.isActive()) return false;

    const steps = filterAvailableSteps(
      buildTourSteps({ variant, hasExpenses, isReplay: trigger === "replay" }),
      (id) => document.querySelector(selectorFor(id)) !== null,
    );
    if (steps.length === 0) return false;

    const total = steps.length;
    const ending = steps[total - 1].ending ?? "done";
    let outcome: "completed" | "skipped" | null = null;
    let activeIndex = 0;

    const tour = driver({
      steps: steps.map((step) => ({
        element: selectorFor(step.id),
        popover: { title: step.title, description: step.description, doneBtnText: step.doneLabel ?? "Done" },
      })),
      popoverClass: "qe-tour-popover",
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      closeBtnLabel: "Close tour",
      allowClose: true,
      allowKeyboardControl: true,
      overlayClickBehavior: "nextStep",
      focus: "popover",
      scrollIntoView: false,
      stagePadding: 6,
      stageRadius: 10,
      onPopoverRender: (popover, { index }) => {
        popover.wrapper.setAttribute("role", "dialog");
        popover.wrapper.setAttribute("aria-modal", "true");
        popover.wrapper.setAttribute("aria-label", popover.title.textContent ?? "Quick tour");
        popover.previousButton.hidden = (index ?? 0) === 0;
        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "qe-tour-skip";
        skip.textContent = "Skip tour";
        skip.addEventListener("click", () => {
          outcome = "skipped";
          tour.destroy();
        });
        popover.footer.insertBefore(skip, popover.footerButtons);
      },
      onHighlightStarted: (element) => scrollTargetIntoView(element),
      onHighlighted: (_element, _step, { index }) => {
        activeIndex = index ?? 0;
        trackEvent("onboarding_tour_step_viewed", { step_id: steps[activeIndex].id, step_index: activeIndex + 1, total_steps: total });
      },
      onDoneClick: () => {
        outcome = "completed";
        tour.destroy();
        if (ending === "add-expense") void navigateRef.current("/add");
      },
      onDestroyed: (_element, _step, { reason }) => {
        const result = outcome ?? (reason === "done" ? "completed" : "skipped");
        if (result === "completed") {
          trackEvent("onboarding_tour_completed", { trigger, path: variant });
        } else {
          trackEvent("onboarding_tour_skipped", { step_id: steps[activeIndex].id, step_index: activeIndex + 1 });
        }
        if (trigger === "auto") markSeenRef.current();
        if (driverRef.current === tour) driverRef.current = null;
      },
    });

    driverRef.current = tour;
    trackEvent("onboarding_tour_started", { trigger, path: variant, total_steps: total });
    tour.drive();
    return true;
  }, []);

  return { start };
}
