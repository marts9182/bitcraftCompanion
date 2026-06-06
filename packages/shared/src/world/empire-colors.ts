// Empire emblem colors come straight from the game (empire_color_desc.color_argb).
// The palette skews pale/pastel and many empires use white/cream defaults, which
// wash out as territory fills on the dark map. `vividTerritoryColor` boosts the
// saturation and pulls very-light colors toward mid-lightness so genuinely-colored
// empires POP, while leaving (near-)grayscale emblems — e.g. the white ones — as-is
// (we never fabricate a hue for a gray, so a "white empire" stays white, not red).

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Make an empire's emblem color read as a vivid territory fill on the dark map.
 * Colors with a real hue (saturation above a small threshold) get their
 * saturation boosted and lightness clamped toward mid so they're rich; near-gray
 * colors (including white) are returned unchanged. Invalid input is returned as-is.
 */
export function vividTerritoryColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  if (s <= 0.08) return hex; // grayscale / white — leave alone, never fabricate a hue
  const s2 = clamp(s * 1.6 + 0.1, 0, 1);
  const l2 = clamp(l, 0.34, 0.6);
  return hslToHex(h, s2, l2);
}
