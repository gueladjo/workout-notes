import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useRouteDate, useSettings } from '@/app/hooks';
import { listCategories, deleteCategory, reorderCategories } from '@/db/repo/categories';
import { deleteExercise, exerciseUsage, favouriteCount, listExercises, setFavourite } from '@/db/repo/exercises';
import { listRoutines } from '@/db/repo/routines';
import { updateSettings } from '@/db/repo/settings';
import { ExerciseListDetailType } from '@/db/constants';
import { androidColourToHex } from '@/domain/colour';
import { relativeDays } from '@/domain/dates';
import { TopBar } from '@/ui/components/TopBar';
import { IconButton } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { Menu, MenuButton, type MenuItem } from '@/ui/components/Menu';
import { ConfirmDialog } from '@/ui/components/Dialog';
import { EmptyState } from '@/ui/components/EmptyState';
import type { ExerciseWithCategory } from '@/db/types';
import { completeReturnTo } from '@/app/return-to';

const FAVOURITES = -1;

/**
 * Exercise List: categories first, then the exercises of the tapped category. Tapping an exercise
 * opens the Training Screen for the route date. Also hosts the "All Exercises / Routines" dropdown.
 */
export function ExerciseListScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const date = useRouteDate();
  const settings = useSettings();
  const categoryId = params.categoryId !== undefined ? Number(params.categoryId) : undefined;
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownAnchor, setDropdownAnchor] = useState<HTMLElement | null>(null);
  const [reordering, setReordering] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'exercise' | 'category'; id: number; name: string } | null>(null);
  const returnTo = search.get('returnTo'); // e.g. a routine editor wanting an exercise id

  const categories = useQuery((d) => listCategories(d, settings.categorySortOrder === 1 ? 'manual' : 'name'), [settings.categorySortOrder]);
  const favourites = useQuery((d) => favouriteCount(d));
  const routines = useQuery((d) => listRoutines(d));
  const usage = useQuery((d) => (settings.exerciseListDetailType !== ExerciseListDetailType.NONE ? exerciseUsage(d) : null), [
    settings.exerciseListDetailType,
  ]);
  const searching = query.trim().length > 0;
  const exercises = useQuery(
    (d) =>
      searching
        ? listExercises(d, { search: query })
        : categoryId === undefined
          ? []
          : categoryId === FAVOURITES
            ? listExercises(d, { favouritesOnly: true })
            : listExercises(d, { categoryId }),
    [query, categoryId, searching],
  );
  const category = categories.find((c) => c.id === categoryId);
  const title = searching ? 'Search' : categoryId === FAVOURITES ? 'Favorites' : (category?.name ?? 'All Exercises');

  const pick = (ex: ExerciseWithCategory) => {
    if (returnTo) navigate(completeReturnTo(db, returnTo, ex.id), { replace: true });
    else navigate(`/train/${date}/${ex.id}`, { replace: true });
  };

  const detail = (ex: ExerciseWithCategory) => {
    if (!usage) return null;
    const u = usage.get(ex.id);
    const parts: string[] = [];
    const t = settings.exerciseListDetailType;
    if (t === ExerciseListDetailType.WORKOUT_COUNT || t === ExerciseListDetailType.BOTH)
      parts.push(`${u?.workouts ?? 0} workout${u?.workouts === 1 ? '' : 's'}`);
    if (t === ExerciseListDetailType.LAST_USED || t === ExerciseListDetailType.BOTH)
      parts.push(u ? relativeDays(u.lastDate) : 'Never');
    return parts.join(' · ');
  };

  const dropdownItems: MenuItem[] = [
    { label: 'All Exercises', icon: 'list', onSelect: () => navigate(`/exercises?date=${date}`, { replace: true }) },
    ...routines.map((r) => ({ label: r.name, icon: 'routine' as const, onSelect: () => navigate(`/routine/${r.id}?date=${date}`, { replace: true }) })),
    { label: '', divider: true, onSelect: () => {} },
    { label: 'Create New Routine', icon: 'add', onSelect: () => navigate(`/routine/new?date=${date}`) },
  ];

  const listMenu: MenuItem[] =
    categoryId === undefined && !searching
      ? [
          { label: 'Reorder categories', icon: 'reorder', onSelect: () => setReordering((r) => !r), checked: reordering },
          {
            label: 'Sort alphabetically',
            onSelect: () => updateSettings(db, { categorySortOrder: settings.categorySortOrder === 1 ? 0 : 1 }),
            checked: settings.categorySortOrder !== 1,
          },
          {
            label: 'Show colours',
            onSelect: () => updateSettings(db, { categoryShowColours: !settings.categoryShowColours }),
            checked: settings.categoryShowColours,
          },
        ]
      : [
          {
            label: 'Show workout count',
            onSelect: () => toggleDetail(ExerciseListDetailType.WORKOUT_COUNT),
            checked: settings.exerciseListDetailType === ExerciseListDetailType.WORKOUT_COUNT || settings.exerciseListDetailType === ExerciseListDetailType.BOTH,
          },
          {
            label: 'Show last used date',
            onSelect: () => toggleDetail(ExerciseListDetailType.LAST_USED),
            checked: settings.exerciseListDetailType === ExerciseListDetailType.LAST_USED || settings.exerciseListDetailType === ExerciseListDetailType.BOTH,
          },
        ];

  function toggleDetail(bit: number) {
    const cur = settings.exerciseListDetailType;
    const hasCount = cur === ExerciseListDetailType.WORKOUT_COUNT || cur === ExerciseListDetailType.BOTH;
    const hasLast = cur === ExerciseListDetailType.LAST_USED || cur === ExerciseListDetailType.BOTH;
    const nextCount = bit === ExerciseListDetailType.WORKOUT_COUNT ? !hasCount : hasCount;
    const nextLast = bit === ExerciseListDetailType.LAST_USED ? !hasLast : hasLast;
    const next = nextCount && nextLast ? ExerciseListDetailType.BOTH : nextCount ? ExerciseListDetailType.WORKOUT_COUNT : nextLast ? ExerciseListDetailType.LAST_USED : ExerciseListDetailType.NONE;
    updateSettings(db, { exerciseListDetailType: next });
  }

  const orderedCategories = useMemo(() => categories, [categories]);

  return (
    <div className="screen">
      <TopBar
        back
        onBack={() => (categoryId !== undefined && !searching ? navigate(`/exercises?date=${date}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`, { replace: true }) : navigate(-1))}
        title={
          <button ref={setDropdownAnchor} className="row" style={{ gap: 4, fontWeight: 600, fontSize: 18 }} onClick={() => setDropdownOpen(true)}>
            {title}
            <Icon name="expandMore" size={20} />
          </button>
        }
        actions={
          <>
            <IconButton
              icon="add"
              label="Add exercise"
              primary
              onClick={() => navigate(`/exercise/new?date=${date}${categoryId && categoryId > 0 ? `&categoryId=${categoryId}` : ''}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`)}
            />
            <MenuButton items={listMenu} />
          </>
        }
      />
      <Menu anchor={dropdownAnchor} open={dropdownOpen} onClose={() => setDropdownOpen(false)} items={dropdownItems} align="left" />
      <div style={{ padding: '10px 12px 0' }}>
        <div className="row" style={{ position: 'relative' }}>
          <Icon name="search" size={20} className="muted" style={{ position: 'absolute', left: 12 }} />
          <input
            className="input"
            style={{ paddingLeft: 40 }}
            placeholder="Search exercises"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search exercises"
          />
          {query && (
            <IconButton icon="close" label="Clear search" small onClick={() => setQuery('')} style={{ position: 'absolute', right: 4 }} />
          )}
        </div>
      </div>
      <div className="screen__content">
        <div className="container">
          {!searching && categoryId === undefined ? (
            <div className="list">
              {favourites > 0 && (
                <button className="list__item" onClick={() => navigate(`/exercises/${FAVOURITES}?date=${date}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`)}>
                  <Icon name="star" size={22} className="iconbtn--primary" style={{ color: 'var(--color-primary)' }} />
                  <div className="list__text">
                    <div className="list__primary">Favorites</div>
                  </div>
                  <span className="list__meta">{favourites}</span>
                  <Icon name="chevronRight" className="faint" />
                </button>
              )}
              {orderedCategories.map((c, i) => (
                <div key={c.id} className="list__item" style={{ padding: 0 }}>
                  <button
                    className="list__item"
                    style={{ border: 'none' }}
                    onClick={() => navigate(`/exercises/${c.id}?date=${date}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`)}
                  >
                    {settings.categoryShowColours && <span className="swatch" style={{ background: androidColourToHex(c.colour) }} />}
                    <div className="list__text">
                      <div className="list__primary">{c.name}</div>
                    </div>
                    {!reordering && <Icon name="chevronRight" className="faint" />}
                  </button>
                  {reordering ? (
                    <div className="row" style={{ paddingRight: 6 }}>
                      <IconButton
                        icon="arrowUp"
                        label="Move up"
                        small
                        disabled={i === 0}
                        onClick={() => {
                          const ids = orderedCategories.map((x) => x.id);
                          [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                          reorderCategories(db, ids);
                          if (settings.categorySortOrder !== 1) updateSettings(db, { categorySortOrder: 1 });
                        }}
                      />
                      <IconButton
                        icon="arrowDown"
                        label="Move down"
                        small
                        disabled={i === orderedCategories.length - 1}
                        onClick={() => {
                          const ids = orderedCategories.map((x) => x.id);
                          [ids[i + 1], ids[i]] = [ids[i]!, ids[i + 1]!];
                          reorderCategories(db, ids);
                          if (settings.categorySortOrder !== 1) updateSettings(db, { categorySortOrder: 1 });
                        }}
                      />
                    </div>
                  ) : (
                    <MenuButton
                      small
                      items={[
                        { label: 'Edit', icon: 'edit', onSelect: () => navigate(`/exercise/new?date=${date}&editCategory=${c.id}`) },
                        { label: 'Delete', icon: 'delete', danger: true, onSelect: () => setConfirm({ kind: 'category', id: c.id, name: c.name }) },
                      ]}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : exercises.length === 0 ? (
            <EmptyState title={searching ? 'No matching exercises' : 'No exercises'} message="Tap + to create one." />
          ) : (
            <div className="list">
              {exercises.map((ex) => (
                <div key={ex.id} className="list__item" style={{ padding: 0 }}>
                  <button className="list__item" style={{ border: 'none' }} onClick={() => pick(ex)}>
                    {searching && <span className="dot" style={{ background: androidColourToHex(ex.categoryColour) }} />}
                    <div className="list__text">
                      <div className="list__primary">
                        {ex.name}
                        {ex.isFavourite && <Icon name="star" size={16} style={{ color: 'var(--color-primary)', marginLeft: 6, verticalAlign: -3 }} />}
                      </div>
                      {(searching || usage) && (
                        <div className="list__secondary">{[searching ? ex.categoryName : null, detail(ex)].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                  </button>
                  <MenuButton
                    small
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => navigate(`/exercise/${ex.id}/edit?date=${date}`) },
                      { label: ex.isFavourite ? 'Remove favorite' : 'Favorite', icon: ex.isFavourite ? 'star' : 'starOutline', onSelect: () => setFavourite(db, ex.id, !ex.isFavourite) },
                      { label: 'History', icon: 'history', onSelect: () => navigate(`/exercise/${ex.id}/overview?date=${date}`) },
                      { label: 'Delete', icon: 'delete', danger: true, onSelect: () => setConfirm({ kind: 'exercise', id: ex.id, name: ex.name }) },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'category' ? `Delete category "${confirm.name}"?` : `Delete "${confirm?.name}"?`}
        message={
          confirm?.kind === 'category'
            ? 'All exercises in this category, along with their training history, personal records and goals, will be permanently deleted.'
            : 'All training history, personal records and goals for this exercise will be permanently deleted.'
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'category') {
            deleteCategory(db, confirm.id);
            if (categoryId === confirm.id) navigate(`/exercises?date=${date}`, { replace: true });
          } else deleteExercise(db, confirm.id);
        }}
      />
    </div>
  );
}
