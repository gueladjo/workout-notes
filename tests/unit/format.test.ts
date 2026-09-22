import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/db/repo/settings';
import { formatStatValue } from '../../src/ui/format';

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
