// Ті самі кольори, що й CSS-змінні в styles/global.css (--blue-600, --green-600, --gray-*) —
// продубльовані тут як hex, бо recharts передає їх у SVG-атрибути (fill/stroke), а не в
// звичайні CSS-властивості; той самий підхід уже використовує FleetMap.tsx.
export const CHART_COLORS = {
  blue: '#2e6bb0',
  green: '#1b8a5a',
  amber: '#b8790b',
  red: '#c23b3b',
  gridLine: '#e1e4e9',
  axisText: '#767c86',
  axisTextDark: '#454b54',
};
