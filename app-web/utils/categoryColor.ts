// Hand-curated, maximally-distinct qualitative palette (extends Sasha Trubetskoy's "20 distinct
// colors" set) — each entry is a recognizably different hue/shade, not just a hue-wheel offset,
// so no two categories look alike even when several land near each other in the chart.
const CATEGORY_PALETTE = [
  "#E6194B", "#3CB44B", "#4363D8", "#F58231",
  "#911EB4", "#46F0F0", "#F032E6", "#BFEF45",
  "#FABEBE", "#469990", "#9A6324", "#800000",
  "#AAFFC3", "#808000", "#FFD8B1", "#000075",
  "#708090", "#FFE119", "#DCBEFF", "#FFFAC8",
];

function hashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic color for a category name — same name always maps to the same palette entry. */
export function getCategoryColor(label: string): string {
  return CATEGORY_PALETTE[hashCode(label) % CATEGORY_PALETTE.length];
}
