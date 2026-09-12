import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDuration,
  isValidIsoDate,
  parseDuration,
  startOfWeek,
  toIsoDate,
  parseIsoDate,
} from '../../src/domain/dates';

describe('dates', () => {
  it('round-trips ISO dates as local calendar dates', () => {
    expect(toIsoDate(parseIsoDate('2026-02-28'))).toBe('2026-02-28');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
  });
  it('computes week starts for Sunday/Monday/Saturday conventions', () => {
    // 2026-09-12 is a Saturday
    expect(startOfWeek('2026-09-12', 1)).toBe('2026-09-07'); // Monday start
    expect(startOfWeek('2026-09-12', 0)).toBe('2026-09-06'); // Sunday start
    expect(startOfWeek('2026-09-12', 6)).toBe('2026-09-12'); // Saturday start
  });
  it('formats and parses durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(parseDuration('1:05')).toBe(65);
    expect(parseDuration('1:01:01')).toBe(3661);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('abc')).toBeNaN();
  });
});
