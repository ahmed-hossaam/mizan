export const DEFAULT_CATEGORIES = [
  { name: "Food", color: "#E6A94A" },
  { name: "Transportation", color: "#6A9FE8" },
  { name: "Shopping", color: "#BA83D4" },
  { name: "Bills", color: "#4F8D8B" },
  { name: "Health", color: "#E27B74" },
  { name: "Education", color: "#7183C5" },
  { name: "Entertainment", color: "#D983A9" },
] as const;

export const COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;
