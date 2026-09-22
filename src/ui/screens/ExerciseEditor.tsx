import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useRouteDate, useSettings } from '@/app/hooks';
import {
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
  categoryNameExists,
} from '@/db/repo/categories';
import { createExercise, exerciseNameExists, getExercise, updateExercise } from '@/db/repo/exercises';
import {
  ALL_EXERCISE_TYPES,
  EXERCISE_TYPE_LABELS,
  ExerciseWeightUnit,
  type ExerciseTypeId,
} from '@/db/constants';
import { androidColourToHex, hexToAndroidColour, PALETTE } from '@/domain/colour';
import { resolveWeightUnit } from '@/domain/units';
import { TopBar } from '@/ui/components/TopBar';
import { Button, IconButton } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { useToast } from '@/ui/components/Toast';
import { completeReturnTo } from '@/app/return-to';

/**
 * New / Edit Exercise. Also handles category creation and editing via `?editCategory=`.
 */
export function ExerciseEditorScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const params = useParams();
  const [search] = useSearchParams();
  const date = useRouteDate();
  const settings = useSettings();
  const editId = params.id ? Number(params.id) : undefined;
  const existing = useQuery((d) => (editId ? getExercise(d, editId) : undefined), [editId]);
  const categories = useQuery(
    (d) => listCategories(d, settings.categorySortOrder === 1 ? 'manual' : 'name'),
    [settings.categorySortOrder],
  );
  const editCategoryId = search.get('editCategory') ? Number(search.get('editCategory')) : undefined;
  const returnTo = search.get('returnTo');

  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [categoryId, setCategoryId] = useState<number>(
    existing?.categoryId ?? (Number(search.get('categoryId')) || 0),
  );
  const [typeId, setTypeId] = useState<ExerciseTypeId>(existing?.typeId ?? 0);
  const [weightUnitId, setWeightUnitId] = useState<number>(
    existing?.weightUnitId ?? ExerciseWeightUnit.DEFAULT,
  );
  const [categoryDialog, setCategoryDialog] = useState(editCategoryId !== undefined);
  const [unitChange, setUnitChange] = useState<null | { prev: 'kg' | 'lbs'; next: 'kg' | 'lbs' }>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveCategory = categoryId || categories[0]?.id || 0;

  const save = (andNew = false) => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a name for the exercise.');
    if (exerciseNameExists(db, trimmed, editId))
      return setError('An exercise with this name already exists.');
    if (!effectiveCategory) return setError('Create a category first.');
    if (editId && existing) {
      const prevUnit = resolveWeightUnit(existing.weightUnitId, settings.metric);
      const nextUnit = resolveWeightUnit(weightUnitId, settings.metric);
      if (prevUnit !== nextUnit && !unitChange) {
        setUnitChange({ prev: prevUnit, next: nextUnit });
        return;
      }
      updateExercise(db, editId, {
        name: trimmed,
        notes,
        categoryId: effectiveCategory,
        typeId,
        weightUnitId,
      });
      toast('Exercise updated');
      navigate(-1);
      return;
    }
    const id = createExercise(db, {
      name: trimmed,
      notes,
      categoryId: effectiveCategory,
      typeId,
      weightUnitId,
    });
    if (andNew) {
      setName('');
      setError(null);
      toast(`Saved "${trimmed}"`);
      return;
    }
    if (returnTo) navigate(completeReturnTo(db, returnTo, id), { replace: true });
    else navigate(`/train/${date}/${id}`, { replace: true });
  };

  const applyUnitChange = (convert: boolean) => {
    if (!editId || !unitChange) return;
    updateExercise(db, editId, {
      name: name.trim(),
      notes,
      categoryId: effectiveCategory,
      typeId,
      weightUnitId,
      convertWeightsOnUnitChange: convert,
      previousUnit: unitChange.prev,
      nextUnit: unitChange.next,
    });
    setUnitChange(null);
    toast('Exercise updated');
    navigate(-1);
  };

  return (
    <div className="screen">
      <TopBar
        back
        title={editId ? 'Edit Exercise' : 'New Exercise'}
        actions={
          <>
            {!editId && <IconButton icon="addBox" label="Save and new" primary onClick={() => save(true)} />}
            <IconButton icon="save" label="Save" primary onClick={() => save(false)} />
          </>
        }
      />
      <div className="screen__content">
        <div className="container">
          <div className="card" style={{ padding: 14 }}>
            <label className="field">
              <span className="field__label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus={!editId}
              />
            </label>
            <label className="field">
              <span className="field__label">Notes</span>
              <textarea
                className="textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Form tips, machine settings…"
              />
            </label>
            <div className="field">
              <span className="field__label">Category</span>
              <div className="row">
                <select
                  className="select"
                  value={effectiveCategory}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <IconButton icon="add" label="New category" primary onClick={() => setCategoryDialog(true)} />
              </div>
            </div>
            <label className="field">
              <span className="field__label">Type</span>
              <select
                className="select"
                value={typeId}
                onChange={(e) => setTypeId(Number(e.target.value) as ExerciseTypeId)}
              >
                {ALL_EXERCISE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EXERCISE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {editId && existing && typeId !== existing.typeId && (
                <span className="muted" style={{ fontSize: 13 }}>
                  Changing the type deletes values of fields the new type does not have from this exercise's
                  history, and goals that measure those fields.
                </span>
              )}
            </label>
            {[0, 2, 3, 6].includes(typeId) && (
              <label className="field">
                <span className="field__label">Weight Unit</span>
                <select
                  className="select"
                  value={weightUnitId}
                  onChange={(e) => setWeightUnitId(Number(e.target.value))}
                >
                  <option value={ExerciseWeightUnit.DEFAULT}>
                    Default ({settings.metric ? 'kg' : 'lbs'})
                  </option>
                  <option value={ExerciseWeightUnit.METRIC}>Metric (kg)</option>
                  <option value={ExerciseWeightUnit.IMPERIAL}>Imperial (lbs)</option>
                </select>
              </label>
            )}
            {error && (
              <div className="banner banner--danger" style={{ margin: 0 }}>
                {error}
              </div>
            )}
          </div>
          <Button block large onClick={() => save(false)}>
            Save
          </Button>
        </div>
      </div>
      <CategoryDialog
        open={categoryDialog}
        onClose={() => {
          setCategoryDialog(false);
          if (editCategoryId !== undefined) navigate(-1);
        }}
        editId={editCategoryId}
        onSaved={(id) => setCategoryId(id)}
      />
      <Dialog
        open={unitChange !== null}
        onClose={() => setUnitChange(null)}
        title="Change weight unit"
        actions={
          <>
            <Button variant="text" onClick={() => setUnitChange(null)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => applyUnitChange(false)}>
              Just change unit
            </Button>
            <Button onClick={() => applyUnitChange(true)}>Convert values</Button>
          </>
        }
      >
        <p>
          <b>Convert existing values</b>: 100 {unitChange?.prev} becomes{' '}
          {unitChange?.prev === 'kg' ? '220.46' : '45.36'} {unitChange?.next}.
        </p>
        <p>
          <b>Just change unit</b>: 100 {unitChange?.prev} becomes 100 {unitChange?.next}.
        </p>
      </Dialog>
    </div>
  );
}

export function CategoryDialog({
  open,
  onClose,
  editId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editId?: number;
  onSaved?: (id: number) => void;
}) {
  const db = useDb();
  const existing = useQuery((d) => (editId ? getCategory(d, editId) : undefined), [editId]);
  const categories = useQuery((d) => listCategories(d));
  const usedColours = categories.map((c) => c.colour);
  const [name, setName] = useState(existing?.name ?? '');
  const [colour, setColour] = useState<number>(
    existing?.colour ??
      hexToAndroidColour(PALETTE.find((h) => !usedColours.includes(hexToAndroidColour(h))) ?? PALETTE[0]!),
  );
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    setName(existing?.name ?? '');
    setColour(
      existing?.colour ??
        hexToAndroidColour(PALETTE.find((h) => !usedColours.includes(hexToAndroidColour(h))) ?? PALETTE[0]!),
    );
    setError(null);
  }
  if (!open && seen) setSeen(false);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a name.');
    if (categoryNameExists(db, trimmed, editId)) return setError('A category with this name already exists.');
    if (editId) {
      updateCategory(db, editId, { name: trimmed, colour });
      onSaved?.(editId);
    } else {
      const c = createCategory(db, trimmed, colour);
      onSaved?.(c.id);
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editId ? 'Edit Category' : 'New Category'}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="field">
        <span className="field__label">Colour</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {PALETTE.map((hex) => {
            const c = hexToAndroidColour(hex);
            return (
              <button
                key={hex}
                aria-label={hex}
                onClick={() => setColour(c)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: hex,
                  outline: c === colour ? '3px solid var(--color-text)' : '1px solid var(--color-border)',
                  outlineOffset: 2,
                }}
              />
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Selected:{' '}
          <span
            className="swatch"
            style={{ background: androidColourToHex(colour), display: 'inline-block', verticalAlign: -2 }}
          />{' '}
          {androidColourToHex(colour)}
        </div>
      </div>
      {error && (
        <div className="banner banner--danger" style={{ margin: 0 }}>
          {error}
        </div>
      )}
    </Dialog>
  );
}
