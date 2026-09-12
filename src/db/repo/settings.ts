/**
 * Settings live in FitNotes' single-row `settings` table so they travel with backups in both
 * directions. Column semantics are documented in doc/fitnotes-format.md.
 */
import type { AppDatabase } from '../store';
import { AppTheme, HomeScreenCategoryVisibility, HomeScreenSetLimitType, ExerciseListDetailType } from '../constants';

export interface Settings {
  /** true = kilograms, false = pounds (settings.metric). */
  metric: boolean;
  /** 1 = Sunday, 2 = Monday, 7 = Saturday (java.util.Calendar constants). */
  firstDayOfWeek: number;
  /** Default +/- increment for weight fields, in the display unit. */
  weightIncrement: number;
  trackPersonalRecords: boolean;
  markSetsComplete: boolean;
  autoSelectNextSet: boolean;
  keepScreenOn: boolean;
  graphShowPoints: boolean;
  graphShowTrendLine: boolean;
  graphStartAtZero: boolean;
  /** 0 = include all sets in estimated 1RM; otherwise ignore sets with more reps than this. */
  estimated1rmMaxReps: number;
  calendarCategoryDots: boolean;
  calendarNavigationBar: boolean;
  calendarHistoryCategoryDots: boolean;
  calendarHistoryCategoryNames: boolean;
  calendarHistorySets: boolean;
  /** 0 = alphabetical, 1 = manual (Category.sort_order). */
  categorySortOrder: number;
  categoryShowColours: boolean;
  exerciseListDetailType: number;
  homeScreenLimitType: number;
  homeScreenLimitValue: number;
  homeScreenCategoryVisibility: number;
  homeScreenSkipEmptyDates: boolean;
  appTheme: number;
}

export const DEFAULT_SETTINGS: Settings = {
  metric: true,
  firstDayOfWeek: 2,
  weightIncrement: 2.5,
  trackPersonalRecords: true,
  markSetsComplete: false,
  autoSelectNextSet: false,
  keepScreenOn: false,
  graphShowPoints: true,
  graphShowTrendLine: false,
  graphStartAtZero: false,
  estimated1rmMaxReps: 0,
  calendarCategoryDots: true,
  calendarNavigationBar: true,
  calendarHistoryCategoryDots: true,
  calendarHistoryCategoryNames: false,
  calendarHistorySets: true,
  categorySortOrder: 0,
  categoryShowColours: true,
  exerciseListDetailType: ExerciseListDetailType.NONE,
  homeScreenLimitType: HomeScreenSetLimitType.FIRST,
  homeScreenLimitValue: 5,
  homeScreenCategoryVisibility: HomeScreenCategoryVisibility.NONE,
  homeScreenSkipEmptyDates: false,
  appTheme: AppTheme.LIGHT,
};

/** Map of Settings keys to `settings` columns. */
const COLUMNS: Record<keyof Settings, string> = {
  metric: 'metric',
  firstDayOfWeek: 'first_day_of_week',
  weightIncrement: 'weight_increment',
  trackPersonalRecords: 'track_personal_records',
  markSetsComplete: 'mark_sets_complete',
  autoSelectNextSet: 'auto_select_next_set',
  keepScreenOn: 'keep_screen_on',
  graphShowPoints: 'graph_show_points',
  graphShowTrendLine: 'graph_show_trend_line',
  graphStartAtZero: 'graph_start_at_zero',
  estimated1rmMaxReps: 'estimated_1rm_max_reps_to_include',
  calendarCategoryDots: 'calendar_category_dots_visible',
  calendarNavigationBar: 'calendar_navigation_bar_visible',
  calendarHistoryCategoryDots: 'calendar_history_category_dots_visible',
  calendarHistoryCategoryNames: 'calendar_history_category_names_visible',
  calendarHistorySets: 'calendar_history_sets_visible',
  categorySortOrder: 'category_sort_order',
  categoryShowColours: 'category_show_colours',
  exerciseListDetailType: 'exercise_list_detail_type_id',
  homeScreenLimitType: 'home_screen_limit_type_id',
  homeScreenLimitValue: 'home_screen_limit_value',
  homeScreenCategoryVisibility: 'home_screen_category_visibility_id',
  homeScreenSkipEmptyDates: 'home_screen_skip_empty_dates',
  appTheme: 'app_theme_id',
};

const BOOLEAN_KEYS = new Set<keyof Settings>(
  (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter((k) => typeof DEFAULT_SETTINGS[k] === 'boolean'),
);

function decode<K extends keyof Settings>(key: K, raw: unknown): Settings[K] {
  const fallback = DEFAULT_SETTINGS[key];
  if (raw === null || raw === undefined) return fallback;
  if (BOOLEAN_KEYS.has(key)) return (Number(raw) !== 0) as Settings[K];
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return n as Settings[K];
}

export function getSettings(db: AppDatabase): Settings {
  const row = db.get('SELECT * FROM settings ORDER BY _id ASC LIMIT 1');
  const result = { ...DEFAULT_SETTINGS };
  if (!row) return result;
  for (const key of Object.keys(COLUMNS) as (keyof Settings)[]) {
    const col = COLUMNS[key];
    if (col in row) (result as Record<string, unknown>)[key] = decode(key, row[col]);
  }
  if (result.homeScreenLimitValue < 1 || result.homeScreenLimitValue > 10) result.homeScreenLimitValue = 5;
  return result;
}

export function updateSettings(db: AppDatabase, patch: Partial<Settings>): void {
  db.mutate(() => {
    const exists = db.get('SELECT _id FROM settings ORDER BY _id ASC LIMIT 1');
    if (!exists) db.run('INSERT INTO settings (metric) VALUES (1)');
    const id = Number(db.scalar('SELECT MIN(_id) FROM settings'));
    for (const [key, value] of Object.entries(patch) as [keyof Settings, Settings[keyof Settings]][]) {
      const col = COLUMNS[key];
      const stored = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      db.run(`UPDATE settings SET ${col} = ? WHERE _id = ?`, [stored, id]);
    }
  });
}
