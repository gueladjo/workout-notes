/**
 * FitNotes stores colours as Android colour ints: signed 32-bit ARGB (e.g. red = -65536).
 */

export function androidColourToHex(colour: number): string {
  const rgb = colour & 0xffffff;
  return '#' + rgb.toString(16).padStart(6, '0');
}

export function hexToAndroidColour(hex: string): number {
  const clean = hex.replace('#', '');
  const rgb = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  // Force alpha = 0xff and reinterpret as a signed 32-bit int.
  return (0xff000000 | rgb) | 0;
}

/** Category colour palette offered in the colour picker (also used to seed new categories). */
export const PALETTE = [
  '#e53935',
  '#d81b60',
  '#8e24aa',
  '#5e35b1',
  '#3949ab',
  '#1e88e5',
  '#039be5',
  '#00acc1',
  '#00897b',
  '#43a047',
  '#7cb342',
  '#c0ca33',
  '#fdd835',
  '#ffb300',
  '#fb8c00',
  '#f4511e',
  '#6d4c41',
  '#757575',
  '#546e7a',
  '#212121',
];

/** Pick the first palette colour not used by `used` (falls back to a rotating choice). */
export function nextUnusedColour(used: number[]): number {
  const usedSet = new Set(used);
  for (const hex of PALETTE) {
    const c = hexToAndroidColour(hex);
    if (!usedSet.has(c)) return c;
  }
  return hexToAndroidColour(PALETTE[used.length % PALETTE.length]!);
}

/** Readable text colour (black/white) for a background. */
export function contrastText(colour: number): string {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#ffffff';
}
