import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useRouteDate, useSettings } from '@/app/hooks';
import { addDays, formatLongDate, relativeDays, todayIso, weekdayName } from '@/domain/dates';
import { androidColourToHex } from '@/domain/colour';
import { allWorkoutDates, copySets, deleteWorkoutExercises, getWorkout, moveWorkout, reorderWorkoutExercises } from '@/db/repo/workouts';
import { setWorkoutComment } from '@/db/repo/comments';
import { HomeScreenCategoryVisibility, HomeScreenSetLimitType } from '@/db/constants';
import { formatSet, weightUnitFor } from '@/ui/format';
import { workoutToText } from '@/domain/share';
import { TopBar } from '@/ui/components/TopBar';
import { Button, IconButton } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { MenuButton } from '@/ui/components/Menu';
import { Dialog, ConfirmDialog } from '@/ui/components/Dialog';
import { DatePickerDialog } from '@/ui/components/DatePickerDialog';
import { SetSelectionDialog, type SelectableExercise } from '@/ui/components/SetSelectionDialog';
import { ToggleRow } from '@/ui/components/Toggle';
import { useToast } from '@/ui/components/Toast';
import type { Workout } from '@/db/types';

export function HomeScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const date = useRouteDate();
  const settings = useSettings();
  const workout = useQuery((d) => getWorkout(d, date), [date]);
  const dates = useQuery((d) => allWorkoutDates(d));
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [dialog, setDialog] = useState<'none' | 'copyPick' | 'copySelect' | 'movePick' | 'comment' | 'share' | 'deleteConfirm'>('none');
  const [copySource, setCopySource] = useState<Workout | null>(null);

  const goTo = (iso: string) => {
    setSelected(null);
    navigate(iso === todayIso() ? '/' : `/workout/${iso}`, { replace: true });
  };
  const step = (dir: 1 | -1) => {
    if (settings.homeScreenSkipEmptyDates && dates.length) {
      const next = dir === 1 ? dates.find((d) => d > date) : [...dates].reverse().find((d) => d < date);
      if (next) return goTo(next);
      if (dir === 1 && date < todayIso()) return goTo(todayIso());
    }
    goTo(addDays(date, dir));
  };

  // Horizontal swipe between days.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!touch.current || !t) return;
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) step(dx < 0 ? 1 : -1);
  };

  const previousWorkoutDate = useMemo(() => [...dates].reverse().find((d) => d < date), [dates, date]);

  const openCopyFrom = (iso: string) => {
    setCopySource(getWorkout(db, iso));
    setDialog('copySelect');
  };
  const selectable: SelectableExercise[] = useMemo(
    () =>
      (copySource?.exercises ?? []).map((we) => ({
        exercise: we.exercise,
        sets: we.sets.map((s) => ({
          key: String(s.id),
          metricWeight: s.metricWeight,
          reps: s.reps,
          distanceMetres: s.distanceMetres,
          durationSeconds: s.durationSeconds,
          unit: s.unit,
        })),
      })),
    [copySource],
  );

  const menuItems = [
    { label: 'Copy Workout', icon: 'copy' as const, onSelect: () => setDialog('copyPick') },
    { label: 'Move Workout', icon: 'swap' as const, onSelect: () => setDialog('movePick'), disabled: workout.exercises.length === 0 },
    { label: 'Comment Workout', icon: 'commentOutline' as const, onSelect: () => setDialog('comment') },
    { label: 'Share Workout', icon: 'share' as const, onSelect: () => setDialog('share'), disabled: workout.exercises.length === 0 },
    { label: '', divider: true, onSelect: () => {} },
    { label: 'Routines', icon: 'routine' as const, onSelect: () => navigate(`/routines?date=${date}`) },
    { label: 'Body Tracker', icon: 'body' as const, onSelect: () => navigate('/body') },
    { label: 'Settings', icon: 'settings' as const, onSelect: () => navigate('/settings') },
  ];

  const limit = Math.max(1, settings.homeScreenLimitValue);
  const showCategory = settings.homeScreenCategoryVisibility !== HomeScreenCategoryVisibility.NONE;
  const showColour = settings.homeScreenCategoryVisibility === HomeScreenCategoryVisibility.NAME_AND_COLOUR;

  return (
    <div className="screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {selected ? (
        <SelectionBar
          count={selected.size}
          total={workout.exercises.length}
          onClose={() => setSelected(null)}
          onSelectAll={() => setSelected(new Set(workout.exercises.map((e) => e.exercise.id)))}
          onDelete={() => setDialog('deleteConfirm')}
          onMove={(dir) => {
            if (selected.size !== 1) return;
            const id = [...selected][0]!;
            const ids = workout.exercises.map((e) => e.exercise.id);
            const i = ids.indexOf(id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j]!, ids[i]!];
            reorderWorkoutExercises(db, date, ids);
          }}
        />
      ) : (
        <TopBar
          title={relativeDays(date)}
          subtitle={formatLongDate(date)}
          onTitleClick={() => goTo(todayIso())}
          primary
          actions={
            <>
              <IconButton icon="calendar" label="Calendar" onClick={() => navigate(`/calendar?date=${date}`)} />
              <IconButton icon="add" label="Add exercise" onClick={() => navigate(`/exercises?date=${date}`)} />
              <MenuButton items={menuItems} />
            </>
          }
        />
      )}
      <div className="home-nav">
        <IconButton icon="chevronLeft" label="Previous day" primary onClick={() => step(-1)} />
        <div className="home-nav__date">
          <div className="home-nav__title">{weekdayName(date)}</div>
          <div className="home-nav__sub">
            {workout.exercises.length
              ? `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'} · ${workout.exercises.reduce((n, e) => n + e.sets.length, 0)} sets`
              : 'No workout'}
          </div>
        </div>
        <IconButton icon="chevronRight" label="Next day" primary onClick={() => step(1)} />
      </div>
      <div className="screen__content">
        <div className="container">
          {workout.comment && <div className="workout-comment">{workout.comment}</div>}
          {workout.exercises.length === 0 ? (
            <div className="empty">
              <div className="empty__title">Start New Workout</div>
              <div>Add your first exercise for {relativeDays(date).toLowerCase()}.</div>
              <div className="empty__actions">
                <Button large icon="add" onClick={() => navigate(`/exercises?date=${date}`)}>
                  Start New Workout
                </Button>
                {previousWorkoutDate && (
                  <Button variant="outline" large icon="copy" onClick={() => openCopyFrom(previousWorkoutDate)}>
                    Copy Previous Workout
                  </Button>
                )}
              </div>
            </div>
          ) : (
            workout.exercises.map((we) => {
              const wu = weightUnitFor(we.exercise, settings);
              const setsToShow =
                settings.homeScreenLimitType === HomeScreenSetLimitType.LAST ? we.sets.slice(-limit) : we.sets.slice(0, limit);
              const hidden = we.sets.length - setsToShow.length;
              const complete = we.sets.filter((s) => s.isComplete).length;
              const isSelected = selected?.has(we.exercise.id) ?? false;
              return (
                <LongPressCard
                  key={we.exercise.id}
                  selected={isSelected}
                  onLongPress={() => setSelected(new Set([we.exercise.id]))}
                  onClick={() => {
                    if (selected) {
                      const next = new Set(selected);
                      if (next.has(we.exercise.id)) next.delete(we.exercise.id);
                      else next.add(we.exercise.id);
                      setSelected(next.size ? next : null);
                    } else navigate(`/train/${date}/${we.exercise.id}`);
                  }}
                >
                  <span className="exercise-card__bar" style={{ background: we.group ? androidColourToHex(we.group.colour) : 'transparent' }} />
                  <div className="exercise-card__main">
                    <div className="exercise-card__name">
                      {showColour && <span className="dot" style={{ background: androidColourToHex(we.exercise.categoryColour) }} />}
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{we.exercise.name}</span>
                      {settings.markSetsComplete && (
                        <span className="exercise-card__progress">
                          {complete}/{we.sets.length}
                        </span>
                      )}
                    </div>
                    {showCategory && <div className="exercise-card__category">{we.exercise.categoryName}</div>}
                    {!selected && (
                      <ul className="exercise-card__sets">
                        {setsToShow.map((s) => (
                          <li key={s.id} className={s.isComplete && settings.markSetsComplete ? 'faint' : undefined}>
                            <span>{formatSet(s, we.exercise.typeId, wu, settings)}</span>
                            {s.isPersonalRecord && settings.trackPersonalRecords && <Icon name="trophy" size={15} className="trophy" />}
                            {s.comment && <Icon name="comment" size={15} className="faint" />}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!selected && hidden > 0 && <div className="exercise-card__more">+{hidden} more</div>}
                  </div>
                </LongPressCard>
              );
            })
          )}
        </div>
      </div>
      {!selected && workout.exercises.length > 0 && (
        <button className="fab" aria-label="Add exercise" onClick={() => navigate(`/exercises?date=${date}`)}>
          <Icon name="add" size={28} />
        </button>
      )}

      <DatePickerDialog
        open={dialog === 'copyPick'}
        onClose={() => setDialog('none')}
        title="Copy workout from"
        initialDate={previousWorkoutDate ?? date}
        onlyWorkoutDates
        onPick={openCopyFrom}
      />
      <SetSelectionDialog
        open={dialog === 'copySelect'}
        onClose={() => setDialog('none')}
        title={copySource ? `Copy from ${formatLongDate(copySource.date)}` : 'Copy'}
        exercises={selectable}
        confirmLabel="Copy"
        onConfirm={(sel) => {
          copySets(
            db,
            sel.map(({ exercise, set }) => ({ exerciseId: exercise.id, ...set })),
            date,
          );
          toast(`Copied ${sel.length} set${sel.length === 1 ? '' : 's'}`);
        }}
      />
      <DatePickerDialog
        open={dialog === 'movePick'}
        onClose={() => setDialog('none')}
        title="Move workout to"
        initialDate={date}
        onPick={(iso) => {
          moveWorkout(db, date, iso);
          toast(`Moved to ${formatLongDate(iso)}`);
          goTo(iso);
        }}
      />
      <CommentDialog
        open={dialog === 'comment'}
        onClose={() => setDialog('none')}
        title="Comment Workout"
        initial={workout.comment ?? ''}
        onSave={(text) => setWorkoutComment(db, date, text)}
      />
      <ShareDialog open={dialog === 'share'} onClose={() => setDialog('none')} workout={workout} />
      <ConfirmDialog
        open={dialog === 'deleteConfirm'}
        onClose={() => setDialog('none')}
        title="Delete exercises?"
        message={`All sets of ${selected?.size ?? 0} exercise${selected?.size === 1 ? '' : 's'} in this workout will be deleted.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (selected) deleteWorkoutExercises(db, date, [...selected]);
          setSelected(null);
        }}
      />
    </div>
  );
}

function SelectionBar({
  count,
  total,
  onClose,
  onSelectAll,
  onDelete,
  onMove,
}: {
  count: number;
  total: number;
  onClose: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <header className="topbar">
      <IconButton icon="close" label="Cancel selection" onClick={onClose} />
      <div className="topbar__title">{count} selected</div>
      <div className="topbar__actions">
        {count === 1 && total > 1 && (
          <>
            <IconButton icon="arrowUp" label="Move up" onClick={() => onMove(-1)} />
            <IconButton icon="arrowDown" label="Move down" onClick={() => onMove(1)} />
          </>
        )}
        <IconButton icon="delete" label="Delete" onClick={onDelete} />
        <MenuButton items={[{ label: 'Select All', onSelect: onSelectAll }]} />
      </div>
    </header>
  );
}

/** Card that distinguishes tap from press-and-hold (selection mode). */
export function LongPressCard({
  children,
  selected,
  onClick,
  onLongPress,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, 450);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div
      className={`exercise-card${selected ? ' exercise-card--selected' : ''}`}
      role="button"
      tabIndex={0}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}

export function CommentDialog({
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
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setSeenOpen(true);
    setText(initial);
  }
  if (!open && seenOpen) setSeenOpen(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          {initial && (
            <Button
              variant="danger-text"
              onClick={() => {
                onSave('');
                onClose();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(text);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment" autoFocus />
    </Dialog>
  );
}

function ShareDialog({ open, onClose, workout }: { open: boolean; onClose: () => void; workout: Workout }) {
  const settings = useSettings();
  const toast = useToast();
  const [includeVolume, setIncludeVolume] = useState(false);
  const [includeSets, setIncludeSets] = useState(false);
  const text = workoutToText(workout, settings, { includeVolume, includeSets });
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Workout ${workout.date}`, text });
      } else {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard');
      }
    } catch {
      /* cancelled */
    }
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share Workout"
      wide
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="text"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              toast('Copied to clipboard');
              onClose();
            }}
          >
            Copy
          </Button>
          <Button onClick={share}>Share</Button>
        </>
      }
    >
      <div className="list" style={{ boxShadow: 'none', border: '1px solid var(--color-border)' }}>
        <ToggleRow label="Total Workout Volume" checked={includeVolume} onChange={setIncludeVolume} />
        <ToggleRow label="Total Sets" checked={includeSets} onChange={setIncludeSets} />
      </div>
      <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: 'var(--color-surface-2)', padding: 12, borderRadius: 8 }}>
        {text}
      </pre>
    </Dialog>
  );
}
