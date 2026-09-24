import type { DurationParts } from '@/domain/dates';

/**
 * Time entry as FitNotes' three hh / mm / ss fields, each on the numeric keypad (a single
 * h:mm:ss field has no colon on phone keypads). `value` is the raw text of each field; turn it
 * into seconds with `joinDuration()` when saving.
 */
export function DurationInputs({
  value,
  onChange,
  className,
  inputClassName,
}: {
  value: DurationParts;
  onChange: (next: DurationParts) => void;
  className: string;
  inputClassName: string;
}) {
  const field = (key: keyof DurationParts, label: string, placeholder: string) => (
    <input
      className={inputClassName}
      inputMode="numeric"
      value={value[key]}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      onFocus={(e) => e.target.select()}
    />
  );
  return (
    <div className={className}>
      {field('hours', 'Hours', 'hh')}
      {field('minutes', 'Minutes', 'mm')}
      {field('seconds', 'Seconds', 'ss')}
    </div>
  );
}
