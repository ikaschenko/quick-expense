export type TourVariant = "new_sheet" | "existing_sheet";
export type TourTrigger = "auto" | "replay";
export type TourStepId = "currencies" | "spent-fields-visibility" | "custom-columns" | "sharing" | "add-nav";
/** How the last step ends: open the Add screen, or simply close the tour. */
export type TourEnding = "add-expense" | "done";

export interface TourStep {
  /** Also the `data-tour` attribute value of the highlighted control. */
  id: TourStepId;
  title: string;
  description: string;
  /** Set only on the final step. */
  ending?: TourEnding;
  doneLabel?: string;
}

export interface TourOptions {
  variant: TourVariant;
  hasExpenses: boolean;
  isReplay: boolean;
}

export function tourVariantFromOrigin(origin: string | null | undefined): TourVariant {
  return origin === "created" ? "new_sheet" : "existing_sheet";
}

export function buildTourSteps({ variant, hasExpenses, isReplay }: TourOptions): TourStep[] {
  const isNew = variant === "new_sheet";
  const invitesFirstExpense = !isReplay && (isNew || !hasExpenses);

  return [
    {
      id: "currencies",
      title: "Your currencies",
      description: isNew
        ? "We've added a few sample currencies to get you started. Remove the ones you don't need and add the ones you actually use: up to 3, plus USD."
        : "These are the currencies found in your sheet. Add or remove any anytime.",
    },
    {
      id: "spent-fields-visibility",
      title: "Spent By & Spent For",
      description: "Only tracking for yourself? Tap the eye to hide Spent By and Spent For. You can bring them back anytime.",
    },
    {
      id: "custom-columns",
      title: "Extra details",
      description: isNew
        ? "Want to record extra details, like a payment method or a trip? Add your own fields here, or remove these sample ones."
        : "Want to record extra details, like a payment method or a trip? Add your own fields here, or remove fields you don't need.",
    },
    {
      id: "sharing",
      title: "Share with others",
      description: "Expenses are better together. Invite family or friends to view your expenses, or to add their own.",
    },
    invitesFirstExpense
      ? { id: "add-nav", title: "Ready to go", description: "You're all set! Let's add your first expense.", ending: "add-expense", doneLabel: "Add my first expense" }
      : { id: "add-nav", title: "Ready to go", description: "You're all set. Tap + whenever you spend.", ending: "done", doneLabel: "Done" },
  ];
}

/** Room kept for the popover next to the highlight: popover offset, stage padding and arrow. */
export const TOUR_POPOVER_GAP = 20;
/** Rough popover height, used before the popover is rendered. */
export const TOUR_POPOVER_HEIGHT = 240;
const TOUR_EDGE_GAP = 12;

export interface TourScrollInput {
  /** Target rect in viewport coordinates. */
  targetTop: number;
  targetHeight: number;
  viewportHeight: number;
  /** Height covered by fixed bars at the top and bottom of the viewport. */
  topInset: number;
  bottomInset: number;
}

/**
 * Pixels to scroll the page (positive = down) so the highlighted target and its popover sit between
 * the fixed bars. Returns 0 when they already do; a target too tall to fit is aligned to the top.
 */
export function computeTourScrollDelta({ targetTop, targetHeight, viewportHeight, topInset, bottomInset }: TourScrollInput): number {
  const areaTop = topInset + TOUR_EDGE_GAP;
  const areaBottom = viewportHeight - bottomInset - TOUR_EDGE_GAP;
  const stackHeight = targetHeight + TOUR_POPOVER_GAP + TOUR_POPOVER_HEIGHT;
  const fits = stackHeight <= areaBottom - areaTop;
  if (fits && targetTop >= areaTop && targetTop + stackHeight <= areaBottom) return 0;

  const desiredTop = fits ? areaTop + (areaBottom - areaTop - stackHeight) / 2 : areaTop;
  return Math.round(targetTop - desiredTop);
}

/** Drops steps whose control is not on screen, so progress counts only reachable steps. */
export function filterAvailableSteps(steps: TourStep[], isPresent: (id: TourStepId) => boolean): TourStep[] {
  return steps.filter((step) => isPresent(step.id));
}
