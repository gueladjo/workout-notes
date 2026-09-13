import { Dialog } from './Dialog';
import { Button } from './Button';
import { MonthList, type DayMarker } from './MonthGrid';
import { useQuery } from '@/app/db-context';
import { workoutDates } from '@/db/repo/workouts';
import { listCategories } from '@/db/repo/categories';
import { useSettings } from '@/app/hooks';

/** Pick a date from a scrolling month calendar; workout dates are highlighted with category dots. */
export function DatePickerDialog({
  open,
  onClose,
  onPick,
  title,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (iso: string) => void;
  title: string;
  initialDate: string;
}) {
  const settings = useSettings();
  const markers = useQuery((db) => {
    const colours = new Map(listCategories(db).map((c) => [c.id, c.colour]));
    const m = new Map<string, DayMarker>();
    for (const [date, cats] of workoutDates(db))
      m.set(date, { colours: cats.map((id) => colours.get(id) ?? 0) });
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
      <MonthList
        className="month-list--dialog"
        initialMonth={initialDate}
        selected={initialDate}
        markers={markers}
        weekStart={settings.firstDayOfWeek}
        showDots={settings.calendarCategoryDots}
        compact
        onSelect={(iso) => {
          onPick(iso);
          onClose();
        }}
      />
    </Dialog>
  );
}
