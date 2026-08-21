// Status palette shared by the impact report's cards and its bar chart, so a
// universe reads the same colour in both. Kept out of ResultsScreen so the
// chart doesn't have to import the screen that renders it.
export const STATUS_COLORS = {
  TRANSCENDED:  { primary: '#9575cd', secondary: '#5e35b1', textColor: '#f0eeeb' },
  PRESERVED:    { primary: '#4a90d9', secondary: '#2a5a8a', textColor: '#f0eeeb' },
  COMPROMISED:  { primary: '#7ec88b', secondary: '#4a8a54', textColor: '#0a0a0a' },
  LIBERATED:    { primary: '#d4a032', secondary: '#8a6a1a', textColor: '#0a0a0a' },
  QUARANTINED:  { primary: '#c94040', secondary: '#7b1a1a', textColor: '#f0eeeb' },
};

export const colorsFor = (status) => STATUS_COLORS[status] || STATUS_COLORS.COMPROMISED;

// The case-count thresholds that decide status, as a share of each universe's
// own initialization count. Drawn on the chart as guide lines so a bar's
// distance from the next status flip is visible, not just its height.
export const STATUS_THRESHOLDS = [
  { pct: 30, label: 'PRESERVED', color: '#4a90d9' },
  { pct: 70, label: 'LIBERATED', color: '#d4a032' },
];
