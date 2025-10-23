import { CARD_GROUP_COLORS } from "./themeColors";

export const CARD_GROUPS = {
  g1: {
    id: "g1",
    label: "Red",
    colors: CARD_GROUP_COLORS.g1,
  },
  g2: {
    id: "g2",
    label: "Blue",
    colors: CARD_GROUP_COLORS.g2,
  },
  g3: {
    id: "g3",
    label: "Yellow",
    colors: CARD_GROUP_COLORS.g3,
  },
};

export const CARD_GROUP_ORDER = ["g1", "g2", "g3"];

export const CARD_GROUP_OPTIONS = [
  { value: "", label: "No group" },
  ...CARD_GROUP_ORDER.map((id) => ({ value: id, label: CARD_GROUPS[id].label })),
];
