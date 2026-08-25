// Vivid, hue-diverse qualitative palette — colors are ordered around the hue wheel so any small
// subset (e.g. top-5 categories) stays visually distinct rather than clustering on muted tones.
const CATEGORY_PALETTE = [
  "#E6194B", "#3CB44B", "#4363D8", "#F58231",
  "#911EB4", "#17BECF", "#F032E6", "#BCBD22",
  "#F5C518", "#469990", "#E75480", "#9A6324",
  "#42D4F4", "#800000", "#3D8B37", "#000075",
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
