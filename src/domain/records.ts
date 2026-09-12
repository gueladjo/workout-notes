/**
 * Strength maths: estimated one-rep max (Brzycki, as used by FitNotes) and personal-record
 * detection. Pure functions; the repository layer decides what to store.
 */

/** Brzycki: 1RM = w * 36 / (37 - r). Undefined for reps >= 37; FitNotes treats high reps as unreliable. */
export function estimatedOneRepMax(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  if (reps >= 37) return 0;
  return (weight * 36) / (37 - reps);
}

/** Inverse of Brzycki: the weight liftable for `reps` given a 1RM. */
export function weightForReps(oneRepMax: number, reps: number): number {
  if (reps <= 0 || reps >= 37) return 0;
  return (oneRepMax * (37 - reps)) / 36;
}

export interface SetLike {
  id: number;
  date: string;
  weight: number;
  reps: number;
}

/**
 * Personal records per exact rep count. A set is a record when it has the highest weight ever
 * lifted for exactly that number of reps; on ties the earliest set (by date, then id) wins.
 * Returns the ids of the record sets.
 */
export function personalRecordSetIds(sets: readonly SetLike[]): Set<number> {
  const bestByReps = new Map<number, SetLike>();
  for (const s of sets) {
    if (s.reps <= 0) continue;
    const best = bestByReps.get(s.reps);
    if (!best || s.weight > best.weight || (s.weight === best.weight && isEarlier(s, best))) {
      bestByReps.set(s.reps, s);
    }
  }
  return new Set([...bestByReps.values()].map((s) => s.id));
}

function isEarlier(a: SetLike, b: SetLike): boolean {
  return a.date < b.date || (a.date === b.date && a.id < b.id);
}

export interface RepMax {
  reps: number;
  weight: number;
  /** Set that established the record (for Actual records). */
  set?: SetLike;
  /** True when a higher-rep set with equal or greater weight supersedes this rep count. */
  superseded: boolean;
}

/**
 * Actual rep maxes 1..maxReps. Per FitNotes, a record at a higher rep-count with equal or larger
 * weight supersedes a lower rep-count (shown faded). Rep counts with no data at all are omitted.
 */
export function actualRepMaxes(sets: readonly SetLike[], maxReps = 15): RepMax[] {
  const bestByReps = new Map<number, SetLike>();
  for (const s of sets) {
    if (s.reps <= 0 || s.reps > maxReps) continue;
    const best = bestByReps.get(s.reps);
    if (!best || s.weight > best.weight || (s.weight === best.weight && isEarlier(s, best))) {
      bestByReps.set(s.reps, s);
    }
  }
  const result: RepMax[] = [];
  // Walk from high reps down so we can carry the best "at least this many reps" weight.
  let carryWeight = -Infinity;
  let carrySet: SetLike | undefined;
  const rows: RepMax[] = [];
  for (let r = maxReps; r >= 1; r--) {
    const own = bestByReps.get(r);
    if (own && own.weight >= carryWeight) {
      carryWeight = own.weight;
      carrySet = own;
      rows.push({ reps: r, weight: own.weight, set: own, superseded: false });
    } else if (carrySet) {
      rows.push({ reps: r, weight: carryWeight, set: carrySet, superseded: true });
    }
  }
  for (let i = rows.length - 1; i >= 0; i--) result.push(rows[i]!);
  return result;
}

/**
 * Estimated rep maxes: the best estimated 1RM across all sets (optionally ignoring sets above
 * `maxRepsToInclude`), then Brzycki-projected to 1..15 reps.
 */
export function estimatedRepMaxes(
  sets: readonly SetLike[],
  maxRepsToInclude: number | null = null,
): { oneRepMax: number; source?: SetLike; rows: { reps: number; weight: number }[] } {
  let best = 0;
  let source: SetLike | undefined;
  for (const s of sets) {
    if (maxRepsToInclude !== null && s.reps > maxRepsToInclude) continue;
    const e = estimatedOneRepMax(s.weight, s.reps);
    if (e > best) {
      best = e;
      source = s;
    }
  }
  const rows = [];
  for (let r = 1; r <= 15; r++) rows.push({ reps: r, weight: weightForReps(best, r) });
  return { oneRepMax: best, source, rows };
}
