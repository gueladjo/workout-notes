import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDuration,
  isValidIsoDate,
  splitDuration,
  joinDuration,
  startOfWeek,
  toIsoDate,
  todayIso,
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
  it('converts a Date to the local calendar date, not the UTC one', () => {
    // 23:30 local: in any zone east of UTC the UTC date is still the same day, but west of UTC
    // toISOString() would already say tomorrow; toIsoDate() must always answer the local day.
    const lateEvening = new Date(2026, 8, 12, 23, 30);
    expect(toIsoDate(lateEvening)).toBe('2026-09-12');
    const justAfterMidnight = new Date(2026, 8, 13, 0, 30);
    expect(toIsoDate(justAfterMidnight)).toBe('2026-09-13');
    if (lateEvening.getTimezoneOffset() !== 0) {
      // The UTC slice disagrees with the local day for at least one of the two instants.
      const utcSlices = [lateEvening, justAfterMidnight].map((d) => d.toISOString().slice(0, 10));
      expect(utcSlices).not.toEqual(['2026-09-12', '2026-09-13']);
    }
    // A stored ISO timestamp (Settings "Last backup") round-trips through Date to the local day.
    expect(toIsoDate(new Date(lateEvening.toISOString()))).toBe('2026-09-12');
    expect(todayIso()).toBe(toIsoDate(new Date()));
  });

  it('computes week starts for Sunday/Monday/Saturday conventions', () => {
    // 2026-09-12 is a Saturday
    expect(startOfWeek('2026-09-12', 1)).toBe('2026-09-07'); // Monday start
    expect(startOfWeek('2026-09-12', 0)).toBe('2026-09-06'); // Sunday start
    expect(startOfWeek('2026-09-12', 6)).toBe('2026-09-12'); // Saturday start
  });
  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
  it('splits seconds into the hh / mm / ss fields', () => {
    expect(splitDuration(0)).toEqual({ hours: '', minutes: '', seconds: '' });
    expect(splitDuration(5)).toEqual({ hours: '', minutes: '', seconds: '5' });
    expect(splitDuration(65)).toEqual({ hours: '', minutes: '1', seconds: '05' });
    expect(splitDuration(3661)).toEqual({ hours: '1', minutes: '01', seconds: '01' });
    expect(splitDuration(3600)).toEqual({ hours: '1', minutes: '00', seconds: '00' });
  });
  it('joins the hh / mm / ss fields into seconds', () => {
    expect(joinDuration({ hours: '', minutes: '', seconds: '' })).toBe(0);
    expect(joinDuration({ hours: '1', minutes: '01', seconds: '01' })).toBe(3661);
    expect(joinDuration({ hours: '', minutes: ' 90 ', seconds: '' })).toBe(5400);
    expect(joinDuration({ hours: '', minutes: '1', seconds: '5' })).toBe(65);
    expect(joinDuration({ hours: '', minutes: '1:30', seconds: '' })).toBeNaN();
    expect(joinDuration({ hours: '', minutes: '', seconds: '1.5' })).toBeNaN();
    expect(joinDuration({ hours: '-1', minutes: '', seconds: '' })).toBeNaN();
  });
});
