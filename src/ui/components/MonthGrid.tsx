import { addMonths, daysInMonth, monthName, parseIsoDate, todayIso } from '@/domain/dates';
import { androidColourToHex } from '@/domain/colour';
import { IconButton } from './Button';

export interface DayMarker {
  /** Category colours (Android ints) to show as dots; empty array = plain highlight. */
  colours: number[];
}

/**
 * Month calendar grid shared by the Calendar screen and date-picker dialogs.
 * `month` is any ISO date inside the month to show.
 */
export function MonthGrid({
  month,
  onMonthChange,
  selected,
  onSelect,
  markers,
  weekStart,
  showDots = true,
  compact,
}: {
  month: string;
  onMonthChange: (iso: string) => void;
  selected?: string;
  onSelect: (iso: string) => void;
  markers: Map<string, DayMarker>;
  /** 1 = Sunday, 2 = Monday, 7 = Saturday (Java Calendar convention used by FitNotes). */
  weekStart: number;
  showDots?: boolean;
  compact?: boolean;
}) {
  const d = parseIsoDate(month);
  const year = d.getFullYear();
  const mi = d.getMonth();
  const first = new Date(year, mi, 1).getDay(); // 0 = Sunday
  const startDow = ((weekStart - 1) % 7 + 7) % 7; // 0 = Sunday
  const lead = (first - startDow + 7) % 7;
  const total = daysInMonth(year, mi);
  const today = todayIso();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(`${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const dows = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const headers = Array.from({ length: 7 }, (_, i) => dows[(startDow + i) % 7]);

  return (
    <div className={`month${compact ? ' month--compact' : ''}`}>
      <div className="month__header">
        <IconButton icon="chevronLeft" label="Previous month" onClick={() => onMonthChange(addMonths(month, -1))} />
        <div className="month__title">
          {monthName(mi)} {year}
        </div>
        <IconButton icon="chevronRight" label="Next month" onClick={() => onMonthChange(addMonths(month, 1))} />
      </div>
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
                    marker.colours.slice(0, 4).map((c, j) => (
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
    </div>
  );
}
