import type { AppDatabase } from '../store';
import type { MeasurementRecord, MeasurementUnit, MeasurementWithUnit } from '../types';

interface MeasurementRow {
  _id: number;
  name: string;
  unit_id: number;
  goal_type: number;
  goal_value: number;
  custom: number;
  enabled: number;
  sort_order: number;
  unit_short_name: string | null;
  unit_long_name: string | null;
}

const SELECT =
  'SELECT m.*, mu.short_name AS unit_short_name, mu.long_name AS unit_long_name FROM Measurement m LEFT JOIN MeasurementUnit mu ON mu._id = m.unit_id';

function toMeasurement(r: MeasurementRow): MeasurementWithUnit {
  return {
    id: r._id,
    name: r.name,
    unitId: r.unit_id,
    goalType: r.goal_type,
    goalValue: Number(r.goal_value) || 0,
    custom: !!r.custom,
    enabled: !!r.enabled,
    sortOrder: r.sort_order,
    unitShort: r.unit_short_name ?? '',
    unitLong: r.unit_long_name ?? '',
  };
}

export function listMeasurements(db: AppDatabase, enabledOnly = false): MeasurementWithUnit[] {
  const where = enabledOnly ? ' WHERE m.enabled = 1' : '';
  return db.all<MeasurementRow>(`${SELECT}${where} ORDER BY m.sort_order ASC, m._id ASC`).map(toMeasurement);
}

export function getMeasurement(db: AppDatabase, id: number): MeasurementWithUnit | undefined {
  const r = db.get<MeasurementRow>(`${SELECT} WHERE m._id = ?`, [id]);
  return r ? toMeasurement(r) : undefined;
}

export function listMeasurementUnits(db: AppDatabase): MeasurementUnit[] {
  return db
    .all<{ _id: number; type: number; long_name: string; short_name: string }>('SELECT * FROM MeasurementUnit ORDER BY _id ASC')
    .map((r) => ({ id: r._id, type: r.type, longName: r.long_name, shortName: r.short_name }));
}

export function createMeasurementUnit(db: AppDatabase, longName: string, shortName: string): number {
  return db.mutate(() => {
    db.run('INSERT INTO MeasurementUnit (type, long_name, short_name) VALUES (3, ?, ?)', [longName.trim(), shortName.trim()]);
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export function createMeasurement(
  db: AppDatabase,
  input: { name: string; unitId: number; goalType: number; goalValue: number },
): number {
  return db.mutate(() => {
    // New measurements go to the top of the list.
    db.run('UPDATE Measurement SET sort_order = sort_order + 1');
    db.run(
      'INSERT INTO Measurement (name, unit_id, goal_type, goal_value, custom, enabled, sort_order) VALUES (?, ?, ?, ?, 1, 1, 0)',
      [input.name.trim(), input.unitId, input.goalType, input.goalValue],
    );
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export function updateMeasurement(
  db: AppDatabase,
  id: number,
  patch: { name?: string; unitId?: number; goalType?: number; goalValue?: number; enabled?: boolean },
): void {
  db.mutate(() => {
    const cols: [string, unknown][] = [];
    if (patch.name !== undefined) cols.push(['name', patch.name.trim()]);
    if (patch.unitId !== undefined) cols.push(['unit_id', patch.unitId]);
    if (patch.goalType !== undefined) cols.push(['goal_type', patch.goalType]);
    if (patch.goalValue !== undefined) cols.push(['goal_value', patch.goalValue]);
    if (patch.enabled !== undefined) cols.push(['enabled', patch.enabled ? 1 : 0]);
    for (const [c, v] of cols) db.run(`UPDATE Measurement SET ${c} = ? WHERE _id = ?`, [v as never, id]);
  });
}

/** Remove all recorded values for a measurement. */
export function resetMeasurement(db: AppDatabase, id: number): void {
  db.mutate(() => db.run('DELETE FROM MeasurementRecord WHERE measurement_id = ?', [id]));
}

export function deleteMeasurement(db: AppDatabase, id: number): void {
  db.mutate(() => {
    db.run('DELETE FROM MeasurementRecord WHERE measurement_id = ?', [id]);
    db.run('DELETE FROM Measurement WHERE _id = ?', [id]);
  });
}

export function reorderMeasurements(db: AppDatabase, orderedIds: number[]): void {
  db.mutate(() => orderedIds.forEach((id, i) => db.run('UPDATE Measurement SET sort_order = ? WHERE _id = ?', [i, id])));
}

interface RecordRow {
  _id: number;
  measurement_id: number;
  date: string;
  time: string;
  value: number;
  comment: string | null;
}

function toRecord(r: RecordRow): MeasurementRecord {
  return { id: r._id, measurementId: r.measurement_id, date: r.date, time: r.time, value: Number(r.value), comment: r.comment };
}

/** Records ordered oldest -> newest. */
export function listRecords(db: AppDatabase, measurementId?: number): MeasurementRecord[] {
  if (measurementId !== undefined) {
    return db
      .all<RecordRow>('SELECT * FROM MeasurementRecord WHERE measurement_id = ? ORDER BY date ASC, time ASC, _id ASC', [
        measurementId,
      ])
      .map(toRecord);
  }
  return db.all<RecordRow>('SELECT * FROM MeasurementRecord ORDER BY date ASC, time ASC, _id ASC').map(toRecord);
}

export function latestRecord(db: AppDatabase, measurementId: number): MeasurementRecord | undefined {
  const r = db.get<RecordRow>(
    'SELECT * FROM MeasurementRecord WHERE measurement_id = ? ORDER BY date DESC, time DESC, _id DESC LIMIT 1',
    [measurementId],
  );
  return r ? toRecord(r) : undefined;
}

export function addRecord(
  db: AppDatabase,
  input: { measurementId: number; date: string; time: string; value: number; comment?: string },
): number {
  return db.mutate(() => {
    db.run('INSERT INTO MeasurementRecord (measurement_id, date, time, value, comment) VALUES (?, ?, ?, ?, ?)', [
      input.measurementId,
      input.date,
      input.time,
      input.value,
      input.comment?.trim() || null,
    ]);
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export function updateRecord(
  db: AppDatabase,
  id: number,
  patch: { date?: string; time?: string; value?: number; comment?: string | null },
): void {
  db.mutate(() => {
    const cols: [string, unknown][] = [];
    if (patch.date !== undefined) cols.push(['date', patch.date]);
    if (patch.time !== undefined) cols.push(['time', patch.time]);
    if (patch.value !== undefined) cols.push(['value', patch.value]);
    if (patch.comment !== undefined) cols.push(['comment', patch.comment?.trim() || null]);
    for (const [c, v] of cols) db.run(`UPDATE MeasurementRecord SET ${c} = ? WHERE _id = ?`, [v as never, id]);
  });
}

export function deleteRecord(db: AppDatabase, id: number): void {
  db.mutate(() => db.run('DELETE FROM MeasurementRecord WHERE _id = ?', [id]));
}
