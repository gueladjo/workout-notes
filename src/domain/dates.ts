/**
 * Date helpers. FitNotes stores workout dates as local calendar dates in `YYYY-MM-DD` text and
 * measurement times as `HH:MM:SS`. All functions here work on those strings or on local Date objects;
 * no timezone conversion is ever applied to stored values.
 */

export type IsoDate = string; // 'YYYY-MM-DD'

const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;

export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayIso(): IsoDate {
  return toIsoDate(new Date());
}

export function nowTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Parse 'YYYY-MM-DD' as a local date (noon, to avoid DST edge cases). */
export function parseIsoDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toIsoDate(parseIsoDate(s)) === s;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return toIsoDate(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return iso.slice(0, 8) + '01';
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const d = parseIsoDate(iso);
  return `${iso.slice(0, 8)}${pad2(daysInMonth(d.getFullYear(), d.getMonth()))}`;
}

/** Start of the week containing `iso`; `weekStart` is 0 = Sunday, 1 = Monday, 6 = Saturday. */
export function startOfWeek(iso: IsoDate, weekStart: number): IsoDate {
  const d = parseIsoDate(iso);
  const diff = (d.getDay() - weekStart + 7) % 7;
  return addDays(iso, -diff);
}

export function startOfYear(iso: IsoDate): IsoDate {
  return iso.slice(0, 4) + '-01-01';
}

export function endOfYear(iso: IsoDate): IsoDate {
  return iso.slice(0, 4) + '-12-31';
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function weekdayName(iso: IsoDate, short = false): string {
  const name = WEEKDAYS[parseIsoDate(iso).getDay()] ?? '';
  return short ? name.slice(0, 3) : name;
}

export function monthName(monthIndex: number, short = false): string {
  const name = MONTHS[monthIndex] ?? '';
  return short ? name.slice(0, 3) : name;
}

/** "Monday, 12 September 2026" style label used on the home screen. */
export function formatLongDate(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return `${weekdayName(iso)}, ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`;
}

/** "12 Sep 2026" */
export function formatShortDate(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${monthName(d.getMonth(), true)} ${d.getFullYear()}`;
}

/** "Mon 12 Sep 2026" */
export function formatMediumDate(iso: IsoDate): string {
  return `${weekdayName(iso, true)} ${formatShortDate(iso)}`;
}

/** Relative label like "Today", "Yesterday", "3 days ago", "2 months ago". */
export function relativeDays(iso: IsoDate, today: IsoDate = todayIso()): string {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 0) return `In ${-diff} day${diff === -1 ? '' : 's'}`;
  if (diff < 30) return `${diff} days ago`;
  if (diff < 365) {
    const months = Math.floor(diff / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.floor(diff / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** Format 'HH:MM:SS' as 'HH:MM'. */
export function formatTimeShort(time: string): string {
  return time.slice(0, 5);
}

/** Seconds -> 'H:MM:SS' or 'M:SS'. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/** Hours, minutes and seconds as typed in the three time fields (FitNotes' hh mm ss). */
export interface DurationParts {
  hours: string;
  minutes: string;
  seconds: string;
}

export const EMPTY_DURATION: DurationParts = { hours: '', minutes: '', seconds: '' };

/** Seconds -> the three fields; 0 leaves them all empty, and parts under a non-zero one are padded. */
export function splitDuration(totalSeconds: number): DurationParts {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s === 0) return EMPTY_DURATION;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return {
    hours: h > 0 ? String(h) : '',
    minutes: h > 0 ? pad2(m) : m > 0 ? String(m) : '',
    seconds: h > 0 || m > 0 ? pad2(sec) : String(sec),
  };
}

/**
 * The three fields -> seconds. Empty fields count as 0 and a field may overflow (90 minutes is
 * 1:30:00). Returns NaN when a field is not a whole number.
 */
export function joinDuration(parts: DurationParts): number {
  const nums = [parts.hours, parts.minutes, parts.seconds].map((p) => {
    const t = p.trim();
    return t === '' ? 0 : /^\d+$/.test(t) ? Number(t) : NaN;
  });
  return (nums[0] ?? 0) * 3600 + (nums[1] ?? 0) * 60 + (nums[2] ?? 0);
}
