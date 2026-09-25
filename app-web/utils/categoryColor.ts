// First 18 colors follow the reference chart; the final 7 retain distinct colors from the old palette.
const CATEGORY_PALETTE = [
  "#FF6800", "#A8B400", "#FF920F", "#4F7F0F", "#FFB74D",
  "#31600F", "#F20D18", "#85009C", "#1016C7", "#00989A",
  "#14CCD2", "#762DE2", "#080873", "#840B0B", "#009F1A",
  "#20BF12", "#5C820C", "#ED00DC", "#4363D8", "#46F0F0",
  "#BFEF45", "#FABEBE", "#469990", "#9A6324", "#DCBEFF",
];

/** Color for a category's displayed position; the 26th category starts the palette again. */
export function getCategoryColor(index: number): string {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}
