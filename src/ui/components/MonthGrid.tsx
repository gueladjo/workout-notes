import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addMonths, daysInMonth, monthName, parseIsoDate, startOfMonth, todayIso } from '@/domain/dates';
import { androidColourToHex } from '@/domain/colour';

export interface DayMarker {
  /** Category colours (Android ints) to show as dots; empty array = plain highlight. */
  colours: number[];
}

interface MonthProps {
  selected?: string;
  onSelect: (iso: string) => void;
  markers: Map<string, DayMarker>;
  /** 1 = Sunday, 2 = Monday, 7 = Saturday (Java Calendar convention used by FitNotes). */
  weekStart: number;
  showDots?: boolean;
  compact?: boolean;
}

/** One month: centred "SEPTEMBER 2026" title, weekday headers and the day cells. */
export function MonthGrid({
  month,
  selected,
  onSelect,
  markers,
  weekStart,
  showDots = true,
  compact,
}: MonthProps & { month: string }) {
  const d = parseIsoDate(month);
  const year = d.getFullYear();
  const mi = d.getMonth();
  const first = new Date(year, mi, 1).getDay(); // 0 = Sunday
  const startDow = (((weekStart - 1) % 7) + 7) % 7; // 0 = Sunday
  const lead = (first - startDow + 7) % 7;
  const total = daysInMonth(year, mi);
  const today = todayIso();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let day = 1; day <= total; day++)
    cells.push(`${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const dows = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const headers = Array.from({ length: 7 }, (_, i) => dows[(startDow + i) % 7]);

  return (
    <section className={`month${compact ? ' month--compact' : ''}`} data-month={month.slice(0, 7)}>
      <h2 className="month__title">
        {monthName(mi)} {year}
      </h2>
      <div className="month__grid">
        {headers.map((h, i) => (
          <div key={i} className="month__dow">
            {h}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} className="month__cell month__cell--empty" />;
          const marker = markers.get(iso);
          const cls = [
            'month__cell',
            iso === selected ? 'month__cell--selected' : '',
            iso === today ? 'month__cell--today' : '',
            marker ? 'month__cell--workout' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={iso} className={cls} onClick={() => onSelect(iso)} aria-label={iso}>
              <span className="month__day">{Number(iso.slice(8))}</span>
              {marker && (
                <span className="month__dots">
                  {showDots && marker.colours.length > 0 ? (
                    marker.colours
                      .slice(0, 4)
                      .map((c, j) => (
                        <span key={j} className="dot" style={{ background: androidColourToHex(c) }} />
                      ))
                  ) : (
                    <span className="dot dot--plain" />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A request to bring a month to the top of the list; bump `nonce` to repeat the same month. */
export interface ScrollRequest {
  month: string;
  nonce: number;
}

const CHUNK = 6; // months added at a time when scrolling reaches an end
const EDGE = 600; // px from an end at which more months are added

/**
 * Vertically scrolling list of months, as FitNotes' calendar: starts on `initialMonth` and grows
 * in both directions while the user scrolls, so any date can be reached.
 */
export function MonthList({
  initialMonth,
  scrollTo,
  className,
  ...monthProps
}: MonthProps & {
  initialMonth: string;
  scrollTo?: ScrollRequest;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(() => ({
    start: addMonths(startOfMonth(initialMonth), -CHUNK),
    end: addMonths(startOfMonth(initialMonth), CHUNK),
  }));
  // Grow the range during render so the requested month exists by the time the effect scrolls.
  const [seen, setSeen] = useState(scrollTo?.nonce);
  if (scrollTo && scrollTo.nonce !== seen) {
    setSeen(scrollTo.nonce);
    const m = startOfMonth(scrollTo.month);
    if (m < range.start) setRange({ ...range, start: addMonths(m, -CHUNK) });
    else if (m > range.end) setRange({ ...range, end: addMonths(m, CHUNK) });
  }
  const months = useMemo(() => {
    const out: string[] = [];
    for (let m = range.start; m <= range.end; m = addMonths(m, 1)) out.push(m);
    return out;
  }, [range]);

  // Keep the visible months still when earlier months are inserted above them.
  const heightBeforePrepend = useRef<number | null>(null);
  useLayoutEffect(() => {
    const c = el.current;
    if (c && heightBeforePrepend.current !== null) {
      c.scrollTop += c.scrollHeight - heightBeforePrepend.current;
      heightBeforePrepend.current = null;
    }
  });

  // Initial position and explicit requests (Today, previous/next workout).
  const target = scrollTo?.month ?? initialMonth;
  const nonce = scrollTo?.nonce ?? 0;
  useEffect(() => {
    const c = el.current;
    const section = c?.querySelector<HTMLElement>(`[data-month="${target.slice(0, 7)}"]`);
    if (c && section) c.scrollTop = section.offsetTop;
  }, [target, nonce]);

  const onScroll = () => {
    const c = el.current;
    if (!c) return;
    if (c.scrollTop < EDGE && heightBeforePrepend.current === null) {
      heightBeforePrepend.current = c.scrollHeight;
      setRange((r) => ({ ...r, start: addMonths(r.start, -CHUNK) }));
    } else if (c.scrollHeight - c.scrollTop - c.clientHeight < EDGE) {
      setRange((r) => ({ ...r, end: addMonths(r.end, CHUNK) }));
    }
  };

  return (
    <div ref={el} className={`month-list${className ? ` ${className}` : ''}`} onScroll={onScroll}>
      {months.map((m) => (
        <MonthGrid key={m} month={m} {...monthProps} />
      ))}
    </div>
  );
}
