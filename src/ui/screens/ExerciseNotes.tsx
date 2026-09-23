import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useSettings } from '@/app/hooks';
import { getExercise, updateExercise } from '@/db/repo/exercises';
import { graphOptionsForType } from '@/domain/graphs';
import { resolveWeightUnit } from '@/domain/units';
import { TopBar } from '@/ui/components/TopBar';
import { Button, IconButton } from '@/ui/components/Button';
import { useToast } from '@/ui/components/Toast';
import { parseDecimal } from '@/ui/format';

/** Exercise Notes: free-text notes plus per-exercise defaults (weight increment, default graph). */
export function ExerciseNotesScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const id = Number(useParams().id);
  const exercise = useQuery((d) => getExercise(d, id), [id]);
  const [notes, setNotes] = useState(exercise?.notes ?? '');
  const [increment, setIncrement] = useState(
    exercise?.weightIncrement ? String(exercise.weightIncrement) : '',
  );
  const [graph, setGraph] = useState<string>(
    exercise?.defaultGraphId === null || exercise?.defaultGraphId === undefined
      ? ''
      : String(exercise.defaultGraphId),
  );
  if (!exercise) return <div className="empty">Exercise not found.</div>;
  const unit = resolveWeightUnit(exercise.weightUnitId, settings.metric);
  const save = () => {
    const inc = increment.trim() === '' ? null : parseDecimal(increment);
    if (inc !== null && (!Number.isFinite(inc) || inc <= 0)) return toast('Enter a valid increment');
    updateExercise(db, id, {
      notes,
      weightIncrement: inc,
      defaultGraphId: graph === '' ? null : Number(graph),
    });
    toast('Saved');
    navigate(-1);
  };
  const linkify = (text: string) =>
    text.split(/(https?:\/\/\S+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noreferrer">
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  return (
    <div className="screen">
      <TopBar
        back
        title="Exercise Notes"
        subtitle={exercise.name}
        actions={<IconButton icon="save" label="Save" primary onClick={save} />}
      />
      <div className="screen__content">
        <div className="container">
          <div className="card" style={{ padding: 14 }}>
            <label className="field">
              <span className="field__label">Notes</span>
              <textarea
                className="textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Instructions, form tips, machine settings, links…"
                style={{ minHeight: 140 }}
              />
              {notes && (
                <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                  {linkify(notes)}
                </div>
              )}
            </label>
            {[0, 2, 3, 6].includes(exercise.typeId) && (
              <label className="field">
                <span className="field__label">Weight Increment ({unit})</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                  placeholder={`Default (${settings.weightIncrement})`}
                />
              </label>
            )}
            <label className="field">
              <span className="field__label">Default Graph</span>
              <select className="select" value={graph} onChange={(e) => setGraph(e.target.value)}>
                <option value="">Default</option>
                {graphOptionsForType(exercise.typeId).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button block large onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
