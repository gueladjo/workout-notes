import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useRouteDate, useSettings } from '@/app/hooks';
import {
  addSection,
  copyRoutine,
  createRoutine,
  deleteRoutine,
  deleteSection,
  getRoutine,
  listRoutines,
  logRoutineSection,
  plannedSetsForSection,
  removeSectionExercise,
  renameSection,
  reorderSectionExercises,
  reorderSections,
  setPredefinedSets,
  updateRoutine,
  PopulateSetsType,
  type PlannedSet,
} from '@/db/repo/routines';
import { exerciseTypeFields } from '@/db/constants';
import { androidColourToHex } from '@/domain/colour';
import { formatLongDate, todayIso } from '@/domain/dates';
import { formatSet, weightUnitFor } from '@/ui/format';
import { TopBar } from '@/ui/components/TopBar';
import { Button, IconButton } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { MenuButton, Menu } from '@/ui/components/Menu';
import { Dialog, ConfirmDialog } from '@/ui/components/Dialog';
import { EmptyState } from '@/ui/components/EmptyState';
import {
  SetSelectionDialog,
  SetEditor,
  type SelectableExercise,
  type SelectableSet,
} from '@/ui/components/SetSelectionDialog';
import { GroupDialog } from './GroupDialog';
import { useToast } from '@/ui/components/Toast';
import type { RoutineExerciseDetail, RoutineSectionDetail } from '@/db/types';

/** List of routines (reachable from the home overflow menu). */
export function RoutinesScreen() {
  const navigate = useNavigate();
  const date = useRouteDate();
  const routines = useQuery((d) => listRoutines(d));
  return (
    <div className="screen">
      <TopBar
        back
        title="Routines"
        actions={
          <IconButton
            icon="add"
            label="New routine"
            primary
            onClick={() => navigate(`/routine/new?date=${date}`)}
          />
        }
      />
      <div className="screen__content">
        <div className="container">
          {routines.length === 0 ? (
            <EmptyState
              title="No routines yet"
              message="A routine stores the days and exercises of a workout program so you can log it in one tap."
            >
              <Button large icon="add" onClick={() => navigate(`/routine/new?date=${date}`)}>
                Create New Routine
              </Button>
            </EmptyState>
          ) : (
            <div className="list">
              {routines.map((r) => (
                <button
                  key={r.id}
                  className="list__item"
                  onClick={() => navigate(`/routine/${r.id}?date=${date}`)}
                >
                  <Icon name="routine" className="muted" />
                  <div className="list__text">
                    <div className="list__primary">{r.name}</div>
                    {r.notes && <div className="list__secondary">{r.notes}</div>}
                  </div>
                  <Icon name="chevronRight" className="faint" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Routine view: days with "Log All"; dropdown to switch routines; overflow for edit/copy/delete. */
export function RoutineScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const date = useRouteDate();
  const id = Number(useParams().id);
  const routine = useQuery((d) => getRoutine(d, id), [id]);
  const routines = useQuery((d) => listRoutines(d));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [logSection, setLogSection] = useState<RoutineSectionDetail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);

  const planned = useQuery(
    (d) => (logSection ? plannedSetsForSection(d, logSection.id, date) : []),
    [logSection, date],
  );
  const selectable: SelectableExercise[] = useMemo(() => {
    if (!logSection) return [];
    return logSection.exercises.map((ex) => ({
      exercise: ex.exercise,
      sets: planned
        .filter((p) => p.routineExerciseId === ex.id)
        .map((p, i) => ({
          key: `${ex.id}:${i}`,
          metricWeight: p.metricWeight,
          reps: p.reps,
          distanceMetres: p.distanceMetres,
          durationSeconds: p.durationSeconds,
          unit: p.unit,
          meta: p,
        })),
    }));
  }, [logSection, planned]);

  if (!routine) return <div className="empty">Routine not found.</div>;

  return (
    <div className="screen">
      <TopBar
        back
        onBack={() => navigate(`/exercises?date=${date}`, { replace: true })}
        title={
          <button
            ref={setAnchor}
            className="row"
            style={{ gap: 4, fontWeight: 600, fontSize: 18 }}
            onClick={() => setDropdownOpen(true)}
          >
            {routine.name}
            <Icon name="expandMore" size={20} />
          </button>
        }
        actions={
          <>
            <IconButton
              icon="edit"
              label="Edit routine"
              primary
              onClick={() => navigate(`/routine/${id}/edit?date=${date}`)}
            />
            <MenuButton
              items={[
                {
                  label: 'Edit',
                  icon: 'edit',
                  onSelect: () => navigate(`/routine/${id}/edit?date=${date}&meta=1`),
                },
                { label: 'Copy', icon: 'copy', onSelect: () => setCopyOpen(true) },
                { label: 'Re-Order Days', icon: 'reorder', onSelect: () => setReorderOpen(true) },
                { label: 'Delete', icon: 'delete', danger: true, onSelect: () => setConfirmDelete(true) },
              ]}
            />
          </>
        }
      />
      <Menu
        anchor={anchor}
        open={dropdownOpen}
        onClose={() => setDropdownOpen(false)}
        align="left"
        items={[
          {
            label: 'All Exercises',
            icon: 'list',
            onSelect: () => navigate(`/exercises?date=${date}`, { replace: true }),
          },
          ...routines.map((r) => ({
            label: r.name,
            icon: 'routine' as const,
            checked: r.id === id,
            onSelect: () => navigate(`/routine/${r.id}?date=${date}`, { replace: true }),
          })),
          { label: '', divider: true, onSelect: () => {} },
          { label: 'Create New Routine', icon: 'add', onSelect: () => navigate(`/routine/new?date=${date}`) },
        ]}
      />
      <div className="screen__content">
        <div className="container">
          {routine.notes && <div className="workout-comment">{routine.notes}</div>}
          {routine.sections.length === 0 && (
            <EmptyState
              title="This routine has no days yet"
              message="Tap the pencil to add days and exercises."
            />
          )}
          {routine.sections.map((section) => (
            <div key={section.id} className="card">
              <div className="card__header">
                <div className="card__title">{section.name}</div>
                <Button
                  variant="text"
                  onClick={() => setLogSection(section)}
                  disabled={section.exercises.length === 0}
                >
                  Log All
                </Button>
              </div>
              <div className="card__body">
                {section.exercises.map((ex) => (
                  <RoutineExerciseRow
                    key={ex.id}
                    ex={ex}
                    date={date}
                    onClick={() => navigate(`/train/${date}/${ex.exerciseId}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <SetSelectionDialog
        open={logSection !== null}
        onClose={() => setLogSection(null)}
        title={`Log "${logSection?.name}" on ${formatLongDate(date)}`}
        exercises={selectable}
        confirmLabel="Save"
        onConfirm={(sel) => {
          if (!logSection) return;
          const sets: PlannedSet[] = sel.map(({ set }) => ({
            ...(set.meta as PlannedSet),
            metricWeight: set.metricWeight,
            reps: set.reps,
            distanceMetres: set.distanceMetres,
            durationSeconds: set.durationSeconds,
            unit: set.unit,
          }));
          logRoutineSection(db, logSection.id, date, sets);
          toast(`Added ${sets.length} set${sets.length === 1 ? '' : 's'} to your workout`);
          navigate(date === todayIso() ? '/' : `/workout/${date}`);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete "${routine.name}"?`}
        message="The routine and its days will be deleted. Logged workouts are kept."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          deleteRoutine(db, id);
          navigate(`/exercises?date=${date}`, { replace: true });
        }}
      />
      <NameDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy routine"
        initial={`${routine.name} (copy)`}
        onSave={(name) => {
          const nid = copyRoutine(db, id, name);
          navigate(`/routine/${nid}?date=${date}`, { replace: true });
        }}
      />
      <ReorderDialog
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        title="Re-order days"
        items={routine.sections.map((s) => ({ id: s.id, label: s.name }))}
        onSave={(ids) => reorderSections(db, ids)}
      />
    </div>
  );
}

function RoutineExerciseRow({
  ex,
  date,
  onClick,
  trailing,
}: {
  ex: RoutineExerciseDetail;
  date: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  const settings = useSettings();
  const wu = weightUnitFor(ex.exercise, settings);
  const summary = ex.sets.length
    ? ex.sets
        .map((s) =>
          formatSet(s, ex.exercise.typeId, wu, settings)
            .replace(/\b0 (kg|lbs)\b/, '—')
            .replace(/\b0 reps\b/, '— reps'),
        )
        .join(', ')
    : ex.populateSetsType === PopulateSetsType.COPY_PREVIOUS_WORKOUT
      ? 'Copies previous workout'
      : 'No predefined sets';
  void date;
  return (
    <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--color-divider)' }}>
      <span
        className="group-bar"
        style={{ background: ex.group ? androidColourToHex(ex.group.colour) : 'transparent', minHeight: 28 }}
      />
      <button className="list__text" style={{ textAlign: 'left' }} onClick={onClick} disabled={!onClick}>
        <div className="list__primary">{ex.exercise.name}</div>
        <div className="list__secondary">{summary}</div>
      </button>
      {trailing}
    </div>
  );
}

/** Create / edit a routine: name & notes, days, exercises per day, predefined sets, groups. */
export function RoutineEditorScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const date = useRouteDate();
  const [search, setSearch] = useSearchParams();
  const params = useParams();
  const isNew = params.id === undefined;
  const id = isNew ? undefined : Number(params.id);
  const routine = useQuery((d) => (id ? getRoutine(d, id) : undefined), [id]);
  const [name, setName] = useState(routine?.name ?? '');
  const [notes, setNotes] = useState(routine?.notes ?? '');
  const [metaOpen, setMetaOpen] = useState(isNew || search.get('meta') === '1');
  const [newDay, setNewDay] = useState('');
  const [sectionMenu, setSectionMenu] = useState<{
    section: RoutineSectionDetail;
    anchor: HTMLElement;
  } | null>(null);
  const [renaming, setRenaming] = useState<RoutineSectionDetail | null>(null);
  const [exerciseMenu, setExerciseMenu] = useState<{ ex: RoutineExerciseDetail; anchor: HTMLElement } | null>(
    null,
  );
  const [setsFor, setSetsFor] = useState<RoutineExerciseDetail | null>(null);
  const [groupFor, setGroupFor] = useState<RoutineExerciseDetail | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<RoutineSectionDetail | null>(null);
  // After picking an exercise, the picker adds it to the day and returns with ?editSets=<routine exercise id>
  // so the predefined-sets dialog opens for it (see src/app/return-to.ts).
  const editSetsId = Number(search.get('editSets')) || null;
  const setsForFromUrl = editSetsId
    ? (routine?.sections.flatMap((s) => s.exercises).find((e) => e.id === editSetsId) ?? null)
    : null;
  const closeSets = () => {
    setSetsFor(null);
    if (editSetsId)
      setSearch(
        (p) => {
          p.delete('editSets');
          return p;
        },
        { replace: true },
      );
  };

  const saveMeta = () => {
    if (!name.trim()) return toast('Enter a name for the routine');
    if (isNew) {
      const nid = createRoutine(db, name.trim(), notes);
      navigate(`/routine/${nid}/edit?date=${date}`, { replace: true });
    } else if (id) {
      updateRoutine(db, id, { name: name.trim(), notes });
    }
    setMetaOpen(false);
  };

  if (isNew) {
    return (
      <div className="screen">
        <TopBar
          back
          title="Create New Routine"
          actions={<IconButton icon="save" label="Save" primary onClick={saveMeta} />}
        />
        <div className="screen__content">
          <div className="container">
            <div className="card" style={{ padding: 14 }}>
              <label className="field">
                <span className="field__label">Name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span className="field__label">Notes</span>
                <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <Button block large onClick={saveMeta}>
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!routine || !id) return <div className="empty">Routine not found.</div>;

  const addDay = () => {
    const n = newDay.trim();
    if (!n) return;
    addSection(db, id, n);
    setNewDay('');
  };

  return (
    <div className="screen">
      <TopBar
        back
        onBack={() => navigate(`/routine/${id}?date=${date}`, { replace: true })}
        title={routine.name}
        subtitle="Edit mode"
        actions={
          <IconButton
            icon="save"
            label="Done"
            primary
            onClick={() => navigate(`/routine/${id}?date=${date}`, { replace: true })}
          />
        }
      />
      <div className="screen__content">
        <div className="container">
          {routine.sections.map((section) => (
            <div key={section.id} className="card">
              <div className="card__header">
                <div className="card__title">{section.name}</div>
                <IconButton
                  icon="add"
                  label="Add exercise to day"
                  primary
                  onClick={() =>
                    navigate(
                      `/exercises?date=${date}&returnTo=${encodeURIComponent(`/routine/${id}/edit?date=${date}&sectionId=${section.id}`)}`,
                    )
                  }
                />
                <IconButton
                  icon="more"
                  label="Day options"
                  onClick={(e) => setSectionMenu({ section, anchor: e.currentTarget })}
                />
              </div>
              <div className="card__body">
                {section.exercises.length === 0 && (
                  <div className="muted" style={{ fontSize: 13, padding: '6px 0' }}>
                    Tap + to add an exercise.
                  </div>
                )}
                {section.exercises.map((ex, i) => (
                  <RoutineExerciseRow
                    key={ex.id}
                    ex={ex}
                    date={date}
                    onClick={() => setExerciseMenuFor(ex)}
                    trailing={
                      <div className="row" style={{ gap: 0 }}>
                        <IconButton
                          icon="arrowUp"
                          label="Move up"
                          small
                          disabled={i === 0}
                          onClick={() => {
                            const ids = section.exercises.map((e) => e.id);
                            [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                            reorderSectionExercises(db, ids);
                          }}
                        />
                        <IconButton
                          icon="arrowDown"
                          label="Move down"
                          small
                          disabled={i === section.exercises.length - 1}
                          onClick={() => {
                            const ids = section.exercises.map((e) => e.id);
                            [ids[i + 1], ids[i]] = [ids[i]!, ids[i + 1]!];
                            reorderSectionExercises(db, ids);
                          }}
                        />
                        <IconButton
                          icon="close"
                          label="Remove exercise"
                          small
                          onClick={() => removeSectionExercise(db, ex.id)}
                        />
                      </div>
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="card" style={{ padding: 14 }}>
            <div className="field__label" style={{ marginBottom: 6 }}>
              Press to create a new day
            </div>
            <div className="row">
              <input
                className="input"
                placeholder="Day name (e.g. Push, Monday…)"
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDay()}
              />
              <IconButton icon="add" label="Create day" primary onClick={addDay} />
            </div>
          </div>
        </div>
      </div>

      <Menu
        anchor={sectionMenu?.anchor ?? null}
        open={sectionMenu !== null}
        onClose={() => setSectionMenu(null)}
        items={[
          {
            label: 'Rename day',
            icon: 'edit',
            onSelect: () => sectionMenu && setRenaming(sectionMenu.section),
          },
          {
            label: 'Delete day',
            icon: 'delete',
            danger: true,
            onSelect: () => sectionMenu && setConfirmDeleteSection(sectionMenu.section),
          },
        ]}
      />
      <Menu
        anchor={exerciseMenu?.anchor ?? null}
        open={exerciseMenu !== null}
        onClose={() => setExerciseMenu(null)}
        items={[
          {
            label: 'Edit Predefined Sets',
            icon: 'edit',
            onSelect: () => exerciseMenu && setSetsFor(exerciseMenu.ex),
          },
          {
            label: 'Add To Group',
            icon: 'group',
            onSelect: () => exerciseMenu && setGroupFor(exerciseMenu.ex),
          },
        ]}
      />
      <NameDialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename day"
        initial={renaming?.name ?? ''}
        onSave={(n) => renaming && renameSection(db, renaming.id, n)}
      />
      <ConfirmDialog
        open={confirmDeleteSection !== null}
        onClose={() => setConfirmDeleteSection(null)}
        title={`Delete "${confirmDeleteSection?.name}"?`}
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDeleteSection && deleteSection(db, confirmDeleteSection.id)}
      />
      <PredefinedSetsDialog
        open={setsFor !== null || setsForFromUrl !== null}
        onClose={closeSets}
        ex={setsFor ?? setsForFromUrl}
        justAdded={setsFor === null && setsForFromUrl !== null}
      />
      {groupFor && (
        <GroupDialog
          open
          onClose={() => setGroupFor(null)}
          date=""
          currentExerciseId={groupFor.exerciseId}
          routineSectionId={groupFor.sectionId}
        />
      )}
      <Dialog
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        title="Edit routine"
        actions={
          <>
            <Button variant="text" onClick={() => setMetaOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveMeta}>Save</Button>
          </>
        }
      >
        <label className="field">
          <span className="field__label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Notes</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </Dialog>
    </div>
  );

  function setExerciseMenuFor(ex: RoutineExerciseDetail) {
    // Tapping an exercise shows its options; anchor to the document body centre for simplicity.
    const el = document.activeElement as HTMLElement | null;
    setExerciseMenu({ ex, anchor: el ?? document.body });
  }
}

/**
 * Predefined sets editor: rows of set fields, blank = copy from previous workout. Right after an
 * exercise was added (`justAdded`) the dismiss button is FitNotes' Skip, otherwise Cancel; neither
 * writes anything.
 */
function PredefinedSetsDialog({
  open,
  onClose,
  ex,
  justAdded,
}: {
  open: boolean;
  onClose: () => void;
  ex: RoutineExerciseDetail | null;
  justAdded: boolean;
}) {
  const db = useDb();
  const settings = useSettings();
  const [rows, setRows] = useState<SelectableSet[]>([]);
  const [seen, setSeen] = useState(false);
  if (open && !seen && ex) {
    setSeen(true);
    setRows(
      ex.sets.map((s) => ({
        key: String(s.id),
        metricWeight: s.metricWeight,
        reps: s.reps,
        distanceMetres: s.distanceMetres,
        durationSeconds: s.durationSeconds,
        unit: s.unit,
      })),
    );
  }
  if (!open && seen) setSeen(false);
  if (!ex) return null;
  const wu = weightUnitFor(ex.exercise, settings);
  const fields = exerciseTypeFields(ex.exercise.typeId);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Predefined sets · ${ex.exercise.name}`}
      wide
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {justAdded ? 'Skip' : 'Cancel'}
          </Button>
          <Button
            onClick={() => {
              setPredefinedSets(db, ex.id, rows);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Leave a field at 0 to copy its value from the previous workout each time. Fields: {fields.join(', ')}.
      </p>
      <div className="stack">
        {rows.map((r, i) => (
          <div key={r.key} className="row">
            <span className="set-row__index">{i + 1}</span>
            <SetEditor
              typeId={ex.exercise.typeId}
              value={r}
              weightUnit={wu}
              metric={settings.metric}
              onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? v : x)))}
            />
            <IconButton
              icon="close"
              label="Remove set"
              small
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        block
        icon="add"
        style={{ marginTop: 12 }}
        onClick={() =>
          setRows((rs) => [
            ...rs,
            {
              key: `new-${Date.now()}-${rs.length}`,
              metricWeight: 0,
              reps: 0,
              distanceMetres: 0,
              durationSeconds: 0,
              unit: 0,
            },
          ])
        }
      >
        Add Set
      </Button>
    </Dialog>
  );
}

export function NameDialog({
  open,
  onClose,
  title,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: string;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    setName(initial);
  }
  if (!open && seen) setSeen(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim());
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) {
            onSave(name.trim());
            onClose();
          }
        }}
      />
    </Dialog>
  );
}

export function ReorderDialog({
  open,
  onClose,
  title,
  items,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: { id: number; label: string }[];
  onSave: (ids: number[]) => void;
}) {
  const [order, setOrder] = useState(items);
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    setOrder(items);
  }
  if (!open && seen) setSeen(false);
  const move = (i: number, dir: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + dir;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      flush
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(order.map((x) => x.id));
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {order.map((it, i) => (
        <div key={it.id} className="list__item">
          <div className="list__text">{it.label}</div>
          <IconButton icon="arrowUp" label="Move up" small disabled={i === 0} onClick={() => move(i, -1)} />
          <IconButton
            icon="arrowDown"
            label="Move down"
            small
            disabled={i === order.length - 1}
            onClick={() => move(i, 1)}
          />
        </div>
      ))}
    </Dialog>
  );
}
