import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { parseDecimal } from '@/ui/format';

/**
 * Numeric entry with +/- buttons (FitNotes set fields): label above, then the -/value/+ row.
 * `value` is the raw text so the user can type freely; parse with `parseDecimal()` when saving. `step`
 * drives the buttons. `trailing` sits at the right of the label (e.g. a unit selector).
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
  trailing,
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
  trailing?: ReactNode;
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
        {trailing}
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
