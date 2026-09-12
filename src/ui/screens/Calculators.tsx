import { useState } from 'react';
import { Dialog } from '@/ui/components/Dialog';
import { Button } from '@/ui/components/Button';
import { estimatedOneRepMax, weightForReps } from '@/domain/records';
import { fmt } from '@/domain/units';

/** 1RM Calculator: Brzycki estimate for a weight/reps pair and the projected 2RM..15RM table. */
export function OneRepMaxDialog({ open, onClose, weightUnit, initialWeight, initialReps }: { open: boolean; onClose: () => void; weightUnit: string; initialWeight: string; initialReps: string }) {
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [seen, setSeen] = useState(false);
  if (open && !seen) { setSeen(true); setWeight(initialWeight); setReps(initialReps); }
  if (!open && seen) setSeen(false);
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  const orm = estimatedOneRepMax(w, r);
  return (
    <Dialog open={open} onClose={onClose} title="1RM Calculator" actions={<Button variant="text" onClick={onClose}>Close</Button>}>
      <div className="grid-2">
        <label className="field"><span className="field__label">Weight ({weightUnit})</span><input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        <label className="field"><span className="field__label">Reps</span><input className="input" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} /></label>
      </div>
      <div className="point-details__body" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>Estimated 1RM (Brzycki)</div>
        <div className="point-details__value">{orm > 0 ? `${fmt(orm, 1)} ${weightUnit}` : '—'}</div>
      </div>
      {orm > 0 && (
        <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--color-border)' }}>
          {Array.from({ length: 14 }, (_, i) => i + 2).map((n) => (
            <div key={n} className="stat-row"><span>{n}RM</span><span className="stat-row__value">{fmt(weightForReps(orm, n), 1)} {weightUnit}</span></div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
