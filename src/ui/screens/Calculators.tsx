import { useState } from 'react';
import { Dialog } from '@/ui/components/Dialog';
import { Button } from '@/ui/components/Button';
import { NumberField } from '@/ui/components/NumberField';
import { estimatedOneRepMax, weightForReps } from '@/domain/records';
import { fmt } from '@/domain/units';
import { parseDecimal } from '@/ui/format';

/**
 * 1RM Calculator: Brzycki estimate for a weight/reps pair (the Track tab's -/value/+ fields, the
 * weight stepping by `weightStep`) and the projected 2RM..15RM table.
 */
export function OneRepMaxDialog({
  open,
  onClose,
  weightUnit,
  weightStep,
  initialWeight,
  initialReps,
}: {
  open: boolean;
  onClose: () => void;
  weightUnit: string;
  weightStep: number;
  initialWeight: string;
  initialReps: string;
}) {
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    setWeight(initialWeight);
    setReps(initialReps);
  }
  if (!open && seen) setSeen(false);
  const w = parseDecimal(weight) || 0;
  const r = parseDecimal(reps) || 0;
  const orm = estimatedOneRepMax(w, r);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="1RM Calculator"
      flush
      actions={
        <Button variant="text" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="dialog-fields">
        <NumberField label={`Weight (${weightUnit})`} value={weight} onChange={setWeight} step={weightStep} />
        <NumberField label="Reps" value={reps} onChange={setReps} step={1} decimals={0} inputMode="numeric" />
        <div className="dialog-fields__result">
          <div className="set-dialog__label">Estimated 1RM (Brzycki)</div>
          <div className="point-details__value">{orm > 0 ? `${fmt(orm, 1)} ${weightUnit}` : '—'}</div>
        </div>
      </div>
      {orm > 0 && (
        <div className="set-dialog__menu">
          {Array.from({ length: 14 }, (_, i) => i + 2).map((n) => (
            <div key={n} className="stat-row">
              <span>{n}RM</span>
              <span className="stat-row__value">
                {fmt(weightForReps(orm, n), 1)} {weightUnit}
              </span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
