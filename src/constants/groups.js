export const CARD_GROUPS = {
  g1: {
    id: "g1",
    label: "Red",
    colors: {
      light: {
        cardBg: "#fdeaea",
        cardBorder: "#f87171",
        cardText: "#7f1d1d",
        cardSubtext: "#b91c1c",
        badgeBg: "#fca5a5",
        badgeText: "#7f1d1d",
      },
      dark: {
        cardBg: "#3f1d1d",
        cardBorder: "#f97066",
        cardText: "#fecaca",
        cardSubtext: "#fca5a5",
        badgeBg: "#7f1d1d",
        badgeText: "#fecaca",
      },
    },
  },
  g2: {
    id: "g2",
    label: "Blue",
    colors: {
      light: {
        cardBg: "#e7f0fb",
        cardBorder: "#60a5fa",
        cardText: "#1e3a8a",
        cardSubtext: "#2563eb",
        badgeBg: "#bfdbfe",
        badgeText: "#1e3a8a",
      },
      dark: {
        cardBg: "#13213a",
        cardBorder: "#60a5fa",
        cardText: "#dbeafe",
        cardSubtext: "#93c5fd",
        badgeBg: "#1d4ed8",
        badgeText: "#dbeafe",
      },
    },
  },
  g3: {
    id: "g3",
    label: "Yellow",
    colors: {
      light: {
        cardBg: "#fef3c7",
        cardBorder: "#facc15",
        cardText: "#92400e",
        cardSubtext: "#b45309",
        badgeBg: "#fcd34d",
        badgeText: "#78350f",
      },
      dark: {
        cardBg: "#392910",
        cardBorder: "#facc15",
        cardText: "#fde68a",
        cardSubtext: "#fcd34d",
        badgeBg: "#b45309",
        badgeText: "#fde68a",
      },
    },
  },
};

export const CARD_GROUP_ORDER = ["g1", "g2", "g3"];

export const CARD_GROUP_OPTIONS = [
  { value: "", label: "No group" },
  ...CARD_GROUP_ORDER.map((id) => ({ value: id, label: CARD_GROUPS[id].label })),
];
