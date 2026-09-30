import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/db/repo/settings';
import { DistanceUnit } from '../../src/db/constants';
import { formatDuration } from '../../src/domain/dates';
import { fmt, paceDistanceUnit, paceSecondsPerUnit, speed } from '../../src/domain/units';
import {
  formatStatValue,
  parseDecimal,
  parseSetField,
  readSetDraft,
  setDraftFrom,
} from '../../src/ui/format';

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

describe('paceDistanceUnit', () => {
  it('shows speed and pace per km or mile even for sets logged in metres or feet', () => {
    expect(paceDistanceUnit(DistanceUnit.METRES)).toBe(DistanceUnit.KILOMETRES);
    expect(paceDistanceUnit(DistanceUnit.FEET)).toBe(DistanceUnit.MILES);
    expect(paceDistanceUnit(DistanceUnit.KILOMETRES)).toBe(DistanceUnit.KILOMETRES);
    expect(paceDistanceUnit(DistanceUnit.MILES)).toBe(DistanceUnit.MILES);
  });

  it('gives the History set dialog a readable pace for a 5000 m set', () => {
    // 5000 m in 25:30, logged in metres: 11.76 km/h and 5:06 /km, not 11764.71 m/h and 0:00 /m.
    const unit = paceDistanceUnit(DistanceUnit.METRES);
    expect(fmt(speed(5000, 1530, unit), 2)).toBe('11.76');
    expect(formatDuration(paceSecondsPerUnit(5000, 1530, unit))).toBe('5:06');
    const ft = paceDistanceUnit(DistanceUnit.FEET);
    expect(fmt(speed(1609.344, 600, ft), 2)).toBe('6');
    expect(formatDuration(paceSecondsPerUnit(1609.344, 600, ft))).toBe('10:00');
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

describe('parseSetField', () => {
  it('reads blank as 0 and a decimal comma as a decimal point', () => {
    expect(parseSetField('')).toBe(0);
    expect(parseSetField('  ')).toBe(0);
    expect(parseSetField('0')).toBe(0);
    expect(parseSetField('82,5')).toBe(82.5);
    expect(parseSetField('82.5')).toBe(82.5);
    expect(parseSetField('5.5')).toBe(5.5);
  });

  it('refuses malformed, negative and non-finite text', () => {
    expect(parseSetField('not-a-number')).toBeNaN();
    expect(parseSetField('1o0')).toBeNaN();
    expect(parseSetField('-50')).toBeNaN();
    expect(parseSetField('1e999')).toBeNaN();
    expect(parseSetField('Infinity')).toBeNaN();
  });
});

describe('readSetDraft', () => {
  const stored = { metricWeight: 82.5, reps: 5, distanceMetres: 0, durationSeconds: 0, unit: 0 };
  const cardio = {
    metricWeight: 0,
    reps: 0,
    distanceMetres: 1609.344,
    durationSeconds: 90.4,
    unit: DistanceUnit.MILES,
  };
  const km = DistanceUnit.KILOMETRES;

  it('shows weight and distance rounded, reps and time as they are', () => {
    expect(setDraftFrom(stored, 'kg', km)).toEqual({
      weight: '82.5',
      reps: '5',
      distance: '0',
      time: { hours: '', minutes: '', seconds: '' },
    });
    expect(setDraftFrom({ ...stored, metricWeight: 20 }, 'lbs', km).weight).toBe('44.09');
    expect(setDraftFrom(cardio, 'kg', DistanceUnit.MILES)).toEqual({
      weight: '0',
      reps: '0',
      distance: '1',
      time: { hours: '', minutes: '1', seconds: '30' },
    });
  });

  it('saves an untouched draft back as the exact stored values', () => {
    expect(readSetDraft(stored, setDraftFrom(stored, 'kg', km), 'kg', km)).toEqual(stored);
    // 20 kg reads 44.09 lbs; saving that text back must not store 44.09 lbs = 19.9989 kg.
    const twenty = { ...stored, metricWeight: 20 };
    expect(readSetDraft(twenty, setDraftFrom(twenty, 'lbs', km), 'lbs', km)).toEqual(twenty);
    // A mile shown as "1" keeps its metres, its unit and its fractional seconds.
    const mi = setDraftFrom(cardio, 'kg', DistanceUnit.MILES);
    expect(readSetDraft(cardio, mi, 'kg', DistanceUnit.MILES)).toEqual(cardio);
  });

  it('converts typed values from display units and accepts a decimal comma', () => {
    const comma = { ...setDraftFrom(stored, 'kg', km), weight: '82,5', reps: '8' };
    expect(readSetDraft({ ...stored, metricWeight: 100 }, comma, 'kg', km)).toEqual({
      ...stored,
      metricWeight: 82.5,
      reps: 8,
    });
    const lbs = { ...setDraftFrom(stored, 'lbs', km), weight: '100' };
    expect(readSetDraft(stored, lbs, 'lbs', km)?.metricWeight).toBeCloseTo(45.359, 3);
    // A typed distance is in the display unit and stamps that unit on the set.
    const ride = {
      ...setDraftFrom(stored, 'kg', km),
      distance: '5',
      time: { hours: '', minutes: '25', seconds: '30' },
    };
    expect(readSetDraft(stored, ride, 'kg', km)).toEqual({
      ...stored,
      distanceMetres: 5000,
      durationSeconds: 1530,
      unit: km,
    });
    // Fractional reps pass through: the repositories round them.
    const half = { ...setDraftFrom(stored, 'kg', km), reps: '5.5' };
    expect(readSetDraft(stored, half, 'kg', km)?.reps).toBe(5.5);
  });

  it('saves blank and 0 as 0 (the predefined-set placeholder)', () => {
    const shown = setDraftFrom(stored, 'kg', km);
    const blank = { ...shown, weight: '', reps: '' };
    expect(readSetDraft(stored, blank, 'kg', km)).toEqual({ ...stored, metricWeight: 0, reps: 0 });
    const zero = { ...shown, weight: '0', reps: '0' };
    expect(readSetDraft(stored, zero, 'kg', km)).toEqual({ ...stored, metricWeight: 0, reps: 0 });
    // A distance cleared to blank is a typed 0 in the display unit, like a typed "0" would be.
    const noDistance = {
      ...setDraftFrom(cardio, 'kg', km),
      distance: '',
      time: { hours: '', minutes: '', seconds: '' },
    };
    expect(readSetDraft(cardio, noDistance, 'kg', km)).toEqual({
      ...cardio,
      distanceMetres: 0,
      durationSeconds: 0,
      unit: km,
    });
  });

  it('refuses malformed, negative and non-finite fields and bad time boxes', () => {
    const ok = setDraftFrom(stored, 'kg', km);
    expect(readSetDraft(stored, { ...ok, weight: 'not-a-number' }, 'kg', km)).toBeNull();
    expect(readSetDraft(stored, { ...ok, weight: '-50' }, 'kg', km)).toBeNull();
    expect(readSetDraft(stored, { ...ok, weight: '1e999' }, 'kg', km)).toBeNull();
    expect(readSetDraft(stored, { ...ok, reps: '-1' }, 'kg', km)).toBeNull();
    expect(readSetDraft(stored, { ...ok, distance: 'abc' }, 'kg', km)).toBeNull();
    const junk = { hours: '', minutes: '2x', seconds: '' };
    expect(readSetDraft(stored, { ...ok, time: junk }, 'kg', km)).toBeNull();
    const negative = { hours: '', minutes: '-2', seconds: '' };
    expect(readSetDraft(stored, { ...ok, time: negative }, 'kg', km)).toBeNull();
  });
});
