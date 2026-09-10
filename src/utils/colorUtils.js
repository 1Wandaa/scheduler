// src/utils/colorUtils.js

export const DEPARTMENT_COLOR_PALETTE = [
  { name: 'Sky Blue', hex: '#109EEF' },
  { name: 'Royal Blue', hex: '#2563EB' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Violet Purple', hex: '#8B5CF6' },
  { name: 'Emerald Green', hex: '#16A34A' },
  { name: 'Forest Green', hex: '#15803D' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Golden Yellow', hex: '#EAB308' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Sunset Orange', hex: '#F97316' },
  { name: 'Coral Red', hex: '#EF4444' },
  { name: 'Crimson', hex: '#DC2626' },
  { name: 'Rose Pink', hex: '#EC4899' },
  { name: 'Slate Gray', hex: '#64748B' },
  { name: 'Dark Slate', hex: '#1E293B' },
];

function hexToRgb(hex) {
  if (!hex) return null;
  let clean = String(hex).replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (clean.length > 6) {
    clean = clean.slice(0, 6);
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Returns the friendly color name and normalized hex code for any color hex string.
 * Finds the nearest matching color using RGB distance if not an exact match.
 * @param {string} hex - e.g. '#109EEF' or '109eef'
 * @returns {{ name: string, hex: string }}
 */
export function getColorNameAndCode(hex) {
  if (!hex) return { name: 'Default Blue', hex: '#109EEF' };
  const raw = String(hex).trim().toUpperCase();
  const formattedHex = raw.startsWith('#') ? raw : `#${raw}`;

  // 1. Exact match in palette
  const exact = DEPARTMENT_COLOR_PALETTE.find(c => c.hex.toUpperCase() === formattedHex.slice(0, 7));
  if (exact) return { name: exact.name, hex: exact.hex };

  // 2. Comprehensive standard palette for nearest match
  const NAMED_COLORS = [
    ...DEPARTMENT_COLOR_PALETTE,
    { name: 'Pure White', hex: '#FFFFFF' },
    { name: 'Pure Black', hex: '#000000' },
    { name: 'Vibrant Red', hex: '#FF0000' },
    { name: 'Lime Green', hex: '#00FF00' },
    { name: 'Bright Blue', hex: '#0000FF' },
    { name: 'Bright Yellow', hex: '#FFFF00' },
    { name: 'Magenta', hex: '#FF00FF' },
    { name: 'Aqua / Cyan', hex: '#00FFFF' },
    { name: 'Silver Gray', hex: '#C0C0C0' },
    { name: 'Medium Gray', hex: '#808080' },
    { name: 'Maroon', hex: '#800000' },
    { name: 'Olive Green', hex: '#808000' },
    { name: 'Dark Green', hex: '#008000' },
    { name: 'Deep Purple', hex: '#800080' },
    { name: 'Navy Blue', hex: '#000080' },
    { name: 'Turquoise', hex: '#40E0D0' },
    { name: 'Coral', hex: '#FF7F50' },
    { name: 'Gold', hex: '#FFD700' },
    { name: 'Chocolate', hex: '#D2691E' },
    { name: 'Hot Pink', hex: '#FF69B4' },
    { name: 'Lavender', hex: '#E6E6FA' },
  ];

  const targetRgb = hexToRgb(formattedHex);
  if (!targetRgb) return { name: 'Custom Color', hex: formattedHex };

  let closest = NAMED_COLORS[0];
  let minDistance = Infinity;

  for (const item of NAMED_COLORS) {
    const rgb = hexToRgb(item.hex);
    if (!rgb) continue;
    const dist = Math.sqrt(
      Math.pow(targetRgb.r - rgb.r, 2) +
      Math.pow(targetRgb.g - rgb.g, 2) +
      Math.pow(targetRgb.b - rgb.b, 2)
    );
    if (dist < minDistance) {
      minDistance = dist;
      closest = item;
    }
  }

  return { name: closest.name, hex: formattedHex.slice(0, 7) };
}
