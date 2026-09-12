import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button className="toggle" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <div className="list__text">
        <div className="list__primary">{label}</div>
        {description && <div className="list__secondary">{description}</div>}
      </div>
      <span className="switch" aria-checked={checked} />
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      className="checkbox"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      {checked && <Icon name="check" size={16} />}
    </button>
  );
}
