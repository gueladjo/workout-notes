import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/db/repo/settings';
import { formatStatValue, parseDecimal } from '../../src/ui/format';

const metric = { ...DEFAULT_SETTINGS, metric: true };
const imperial = { ...DEFAULT_SETTINGS, metric: false };

describe('formatStatValue', () => {
  it('shows speed in distance units per hour', () => {
    // 5 km in 25 minutes = 3.333 m/s.
    const metresPerSecond = 5000 / 1500;
    expect(formatStatValue(metresPerSecond, 'speed', 'kg', metric)).toBe('12 km/h');
    expect(formatStatValue(metresPerSecond, 'speed', 'kg', imperial)).toBe('7.5 mi/h');
  });

  it('shows pace as time per distance unit, longer for a slower run', () => {
    // 5 km in 25 minutes = 0.3 s/m = 5:00 per km, 8:03 per mile.
    const secondsPerMetre = 1500 / 5000;
    expect(formatStatValue(secondsPerMetre, 'pace', 'kg', metric)).toBe('5:00 /km');
    expect(formatStatValue(secondsPerMetre, 'pace', 'kg', imperial)).toBe('8:03 /mi');
    expect(formatStatValue(1800 / 5000, 'pace', 'kg', metric)).toBe('6:00 /km');
    expect(formatStatValue(0, 'pace', 'kg', metric)).toBe('0:00 /km');
  });
});

describe('parseDecimal', () => {
  it('reads a decimal comma as a decimal point', () => {
    expect(parseDecimal('82,5')).toBe(82.5);
    expect(parseDecimal('1,25')).toBe(1.25);
    expect(parseDecimal(',5')).toBe(0.5);
  });

  it('otherwise behaves like Number()', () => {
    expect(parseDecimal('82.5')).toBe(82.5);
    expect(parseDecimal('100')).toBe(100);
    expect(parseDecimal('')).toBe(0);
    expect(parseDecimal(' 7 ')).toBe(7);
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1,000,5')).toBeNaN();
    expect(parseDecimal('1.5,2')).toBeNaN();
  });
});
