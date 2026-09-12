import type { AppDatabase } from '../store';
import type { Category } from '../types';
import { nextUnusedColour } from '@/domain/colour';
import { deleteExercise, listExercises } from './exercises';

interface CategoryRow {
  _id: number;
  name: string;
  colour: number;
  sort_order: number;
}

function toCategory(r: CategoryRow): Category {
  return { id: r._id, name: r.name, colour: r.colour, sortOrder: r.sort_order };
}

export function listCategories(db: AppDatabase, order: 'name' | 'manual' = 'name'): Category[] {
  const orderBy = order === 'manual' ? 'sort_order ASC, name COLLATE NOCASE ASC' : 'name COLLATE NOCASE ASC';
  return db.all<CategoryRow>(`SELECT * FROM Category ORDER BY ${orderBy}`).map(toCategory);
}

export function getCategory(db: AppDatabase, id: number): Category | undefined {
  const r = db.get<CategoryRow>('SELECT * FROM Category WHERE _id = ?', [id]);
  return r ? toCategory(r) : undefined;
}

export function createCategory(db: AppDatabase, name: string, colour?: number): Category {
  return db.mutate(() => {
    const used = db.all<{ colour: number }>('SELECT colour FROM Category').map((r) => r.colour);
    const c = colour ?? nextUnusedColour(used);
    const sort = Number(db.scalar('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM Category'));
    db.run('INSERT INTO Category (name, colour, sort_order) VALUES (?, ?, ?)', [name.trim(), c, sort]);
    const id = Number(db.scalar('SELECT last_insert_rowid()'));
    return { id, name: name.trim(), colour: c, sortOrder: sort };
  });
}

export function updateCategory(db: AppDatabase, id: number, patch: { name?: string; colour?: number }): void {
  db.mutate(() => {
    if (patch.name !== undefined)
      db.run('UPDATE Category SET name = ? WHERE _id = ?', [patch.name.trim(), id]);
    if (patch.colour !== undefined)
      db.run('UPDATE Category SET colour = ? WHERE _id = ?', [patch.colour, id]);
  });
}

/** Deletes the category and every exercise in it (with all their data), like FitNotes. */
export function deleteCategory(db: AppDatabase, id: number): void {
  db.mutate(() => {
    for (const ex of listExercises(db, { categoryId: id })) deleteExercise(db, ex.id);
    db.run('DELETE FROM Category WHERE _id = ?', [id]);
  });
}

export function reorderCategories(db: AppDatabase, orderedIds: number[]): void {
  db.mutate(() => {
    orderedIds.forEach((id, i) => db.run('UPDATE Category SET sort_order = ? WHERE _id = ?', [i + 1, id]));
  });
}

export function categoryNameExists(db: AppDatabase, name: string, exceptId?: number): boolean {
  const n = Number(
    db.scalar('SELECT COUNT(*) FROM Category WHERE name = ? COLLATE NOCASE AND _id != ?', [
      name.trim(),
      exceptId ?? -1,
    ]),
  );
  return n > 0;
}
