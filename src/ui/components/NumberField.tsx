import { Icon } from './Icon';
import { DurationInputs } from './DurationInputs';
import { parseDecimal } from '@/ui/format';
import type { DurationParts } from '@/domain/dates';
import { ALL_DISTANCE_UNITS, distanceUnitShort } from '@/domain/units';

/**
 * Numeric entry with +/- buttons (FitNotes set fields): label above, then the -/value/+ row.
 * `value` is the raw text so the user can type freely; parse with `parseDecimal()` when saving. `step`
 * drives the buttons.
 */
export function NumberField({
  label,
  value,
  onChange,
  step,
  min = 0,
  decimals = 2,
  inputMode = 'decimal',
  placeholder,
  name,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  step: number;
  min?: number;
  decimals?: number;
  inputMode?: 'decimal' | 'numeric';
  placeholder?: string;
  name?: string;
}) {
  const adjust = (delta: number) => {
    const current = value.trim() === '' ? 0 : parseDecimal(value);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(min, roundTo(base + delta, decimals));
    onChange(formatNumber(next, decimals));
  };
  return (
    <div className="numfield">
      <div className="numfield__label">
        <span>{label}</span>
      </div>
      <div className="numfield__row">
        <button className="numfield__btn" onClick={() => adjust(-step)} aria-label={`Decrease ${label}`}>
          <Icon name="remove" />
        </button>
        <input
          className="numfield__input"
          inputMode={inputMode}
          value={value}
          name={name}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        <button className="numfield__btn" onClick={() => adjust(step)} aria-label={`Increase ${label}`}>
          <Icon name="add" />
        </button>
      </div>
    </div>
  );
}

export function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/** Trim trailing zeros: 100 -> "100", 62.5 -> "62.5", 2.25 -> "2.25". */
export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '';
  return String(roundTo(n, decimals));
}

/** Distance entry as in FitNotes: the value with its unit selector beside it. Metres by default. */
export function DistanceField({
  value,
  unit,
  onChange,
}: {
  value: string;
  unit: number;
  onChange: (value: string, unit: number) => void;
}) {
  return (
    <div className="numfield">
      <div className="numfield__label">
        <span>Distance</span>
      </div>
      <div className="numfield__row">
        <input
          className="numfield__input"
          inputMode="decimal"
          value={value}
          name="distance"
          aria-label="Distance"
          onChange={(e) => onChange(e.target.value, unit)}
          onFocus={(e) => e.target.select()}
        />
        <select
          className="numfield__unit"
          value={unit}
          onChange={(e) => onChange(value, Number(e.target.value))}
          aria-label="Distance unit"
        >
          {ALL_DISTANCE_UNITS.map((u) => (
            <option key={u} value={u}>
              {distanceUnitShort(u)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Time entry as in FitNotes: hh / mm / ss fields. */
export function DurationField({
  value,
  onChange,
}: {
  value: DurationParts;
  onChange: (v: DurationParts) => void;
}) {
  return (
    <div className="numfield">
      <div className="numfield__label">
        <span>Time</span>
      </div>
      <DurationInputs
        value={value}
        onChange={onChange}
        className="numfield__row"
        inputClassName="numfield__input numfield__input--part"
      />
    </div>
  );
}
