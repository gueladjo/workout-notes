import { useState } from 'react';
import { useDb, useQuery } from '@/app/db-context';
import {
  createGroup,
  deleteGroup,
  GROUP_COLOURS,
  listGroups,
  nextGroupName,
  removeExerciseFromGroup,
  updateGroup,
  type GroupWithExercises,
} from '@/db/repo/groups';
import { getWorkout } from '@/db/repo/workouts';
import { listSectionExercises } from '@/db/repo/routines';
import { listRoutineSectionGroups } from '@/db/repo/groups';
import { androidColourToHex } from '@/domain/colour';
import { Dialog, ConfirmDialog } from '@/ui/components/Dialog';
import { Button, IconButton } from '@/ui/components/Button';
import { Checkbox } from '@/ui/components/Toggle';
import { Icon } from '@/ui/components/Icon';

/**
 * Supersets ("Add To Group"): list the groups of a workout (or routine day), add the current
 * exercise to one, or create/edit/delete a group. `routineSectionId` switches to routine mode.
 */
export function GroupDialog({
  open,
  onClose,
  date,
  currentExerciseId,
  routineSectionId,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  currentExerciseId: number;
  routineSectionId?: number;
}) {
  const db = useDb();
  const groups = useQuery(
    (d) => (routineSectionId ? listRoutineSectionGroups(d, routineSectionId) : listGroups(d, date)),
    [date, routineSectionId],
  );
  const exercises = useQuery(
    (d) =>
      routineSectionId
        ? listSectionExercises(d, routineSectionId).map((e) => e.exercise)
        : getWorkout(d, date).exercises.map((e) => e.exercise),
    [date, routineSectionId],
  );
  const [editing, setEditing] = useState<GroupWithExercises | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const current = groups.find((g) => g.exerciseIds.includes(currentExerciseId));

  return (
    <>
      <Dialog
        open={open && editing === null}
        onClose={onClose}
        title={current ? 'Edit Group' : 'Add To Group'}
        flush
        actions={
          <>
            <Button variant="text" onClick={onClose}>
              Close
            </Button>
            <Button icon="add" onClick={() => setEditing('new')}>
              New Group
            </Button>
          </>
        }
      >
        {groups.length === 0 && (
          <div className="muted" style={{ padding: 16 }}>
            No groups in this workout yet. Create one to superset exercises.
          </div>
        )}
        {groups.map((g) => {
          const member = g.exerciseIds.includes(currentExerciseId);
          return (
            <div key={g.id} className="list__item" style={{ padding: '6px 6px 6px 14px' }}>
              <span className="swatch" style={{ background: androidColourToHex(g.colour) }} />
              <button
                className="list__text"
                style={{ textAlign: 'left' }}
                onClick={() =>
                  member
                    ? removeExerciseFromGroup(db, g.id, currentExerciseId)
                    : updateGroup(db, g.id, { exerciseIds: [...g.exerciseIds, currentExerciseId] })
                }
              >
                <div className="list__primary">{g.name}</div>
                <div className="list__secondary">
                  {g.exerciseIds.map((id) => exercises.find((e) => e.id === id)?.name ?? '?').join(', ')}
                </div>
              </button>
              {member && (
                <Icon name="check" className="iconbtn--primary" style={{ color: 'var(--color-primary)' }} />
              )}
              <IconButton icon="edit" label="Edit group" small onClick={() => setEditing(g)} />
              <IconButton icon="delete" label="Delete group" small onClick={() => setConfirmDelete(g.id)} />
            </div>
          );
        })}
      </Dialog>
      <GroupEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        group={editing === 'new' ? null : editing}
        exercises={exercises}
        defaultName={nextGroupName(db, date)}
        suggestedColour={GROUP_COLOURS[groups.length % GROUP_COLOURS.length]!}
        currentExerciseId={currentExerciseId}
        onSave={(name, colour, ids) => {
          if (editing === 'new')
            createGroup(db, {
              date: routineSectionId ? '' : date,
              routineSectionId: routineSectionId ?? null,
              name,
              colour,
              exerciseIds: ids,
            });
          else if (editing) updateGroup(db, editing.id, { name, colour, exerciseIds: ids });
        }}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete group?"
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDelete !== null && deleteGroup(db, confirmDelete)}
      />
    </>
  );
}

function GroupEditor({
  open,
  onClose,
  group,
  exercises,
  defaultName,
  suggestedColour,
  currentExerciseId,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupWithExercises | null;
  exercises: { id: number; name: string }[];
  defaultName: string;
  suggestedColour: number;
  currentExerciseId: number;
  onSave: (name: string, colour: number, exerciseIds: number[]) => void;
}) {
  const [name, setName] = useState('');
  const [colour, setColour] = useState(GROUP_COLOURS[0]!);
  const [ids, setIds] = useState<number[]>([]);
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    setName(group?.name ?? defaultName);
    setColour(group?.colour ?? suggestedColour);
    setIds(group?.exerciseIds ?? [currentExerciseId]);
  }
  if (!open && seen) setSeen(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={group ? 'Edit Group' : 'New Group'}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || ids.length === 0}
            onClick={() => {
              onSave(name.trim(), colour, ids);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span className="field__label">Colour</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {GROUP_COLOURS.map((c) => (
            <button
              key={c}
              aria-label={androidColourToHex(c)}
              onClick={() => setColour(c)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: androidColourToHex(c),
                outline: c === colour ? '3px solid var(--color-text)' : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field__label">Exercises</span>
        <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--color-border)' }}>
          {exercises.map((e) => (
            <button
              key={e.id}
              className="list__item"
              onClick={() =>
                setIds((cur) => (cur.includes(e.id) ? cur.filter((x) => x !== e.id) : [...cur, e.id]))
              }
            >
              <Checkbox
                checked={ids.includes(e.id)}
                onChange={() =>
                  setIds((cur) => (cur.includes(e.id) ? cur.filter((x) => x !== e.id) : [...cur, e.id]))
                }
                label={e.name}
              />
              <div className="list__text">{e.name}</div>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
