import { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { MonthGrid, type DayMarker } from './MonthGrid';
import { useQuery } from '@/app/db-context';
import { workoutDates } from '@/db/repo/workouts';
import { listCategories } from '@/db/repo/categories';
import { useSettings } from '@/app/hooks';

/** Pick a date from a month calendar; workout dates are highlighted with category dots. */
export function DatePickerDialog({
  open,
  onClose,
  onPick,
  title,
  initialDate,
  onlyWorkoutDates,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (iso: string) => void;
  title: string;
  initialDate: string;
  /** Only allow choosing dates that contain a workout (Copy Workout). */
  onlyWorkoutDates?: boolean;
}) {
  const settings = useSettings();
  const [month, setMonth] = useState(initialDate);
  const markers = useQuery((db) => {
    const colours = new Map(listCategories(db).map((c) => [c.id, c.colour]));
    const m = new Map<string, DayMarker>();
    for (const [date, cats] of workoutDates(db)) m.set(date, { colours: cats.map((id) => colours.get(id) ?? 0) });
    return m;
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      flush
      actions={
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <MonthGrid
        month={month}
        onMonthChange={setMonth}
        selected={initialDate}
        markers={markers}
        weekStart={settings.firstDayOfWeek}
        showDots={settings.calendarCategoryDots}
        compact
        onSelect={(iso) => {
          if (onlyWorkoutDates && !markers.has(iso)) return;
          onPick(iso);
          onClose();
        }}
      />
    </Dialog>
  );
}
