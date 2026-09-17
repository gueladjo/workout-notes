import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { bootstrap, type BootResult } from './bootstrap';
import { UnreadableDatabaseError } from './recovery';
import { RecoveryScreen } from '@/ui/screens/Recovery';
import { DbProvider, useQuery } from './db-context';
import { SqlProvider } from './sql-context';
import { ToastProvider } from '@/ui/components/Toast';
import { getSettings } from '@/db/repo/settings';
import { AppTheme } from '@/db/constants';
import { HomeScreen } from '@/ui/screens/Home';
import { ExerciseListScreen } from '@/ui/screens/ExerciseList';
import { ExerciseEditorScreen } from '@/ui/screens/ExerciseEditor';
import { TrainingScreen } from '@/ui/screens/Training';
import { ExerciseNotesScreen } from '@/ui/screens/ExerciseNotes';
import { RecordsScreen } from '@/ui/screens/Records';
import { ExerciseOverviewScreen } from '@/ui/screens/ExerciseOverview';
import { CalendarScreen } from '@/ui/screens/Calendar';
import { RoutinesScreen, RoutineScreen, RoutineEditorScreen } from '@/ui/screens/Routines';
import { BodyTrackerScreen, MeasurementsScreen, MeasurementEditorScreen } from '@/ui/screens/BodyTracker';
import { SettingsScreen } from '@/ui/screens/Settings';
import { DatabaseScreen } from '@/ui/screens/Database';

export function App() {
  const [boot, setBoot] = useState<BootResult | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    bootstrap().then(setBoot).catch(setFailure);
  }, [attempt]);

  if (failure instanceof UnreadableDatabaseError) {
    return (
      <RecoveryScreen
        error={failure}
        onRecovered={() => {
          setFailure(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (failure) {
    return (
      <div className="empty">
        <div className="empty__title">WorkoutNotes could not start</div>
        <div>{failure instanceof Error ? failure.message : String(failure)}</div>
      </div>
    );
  }
  if (!boot) {
    return (
      <div className="screen">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }
  return (
    <DbProvider db={boot.app}>
      <SqlProvider sql={boot.SQL}>
        <ThemeApplier />
        <ToastProvider>
          <HashRouter>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/workout/:date" element={<HomeScreen />} />
              <Route path="/exercises" element={<ExerciseListScreen />} />
              <Route path="/exercises/:categoryId" element={<ExerciseListScreen />} />
              <Route path="/exercise/new" element={<ExerciseEditorScreen />} />
              <Route path="/exercise/:id/edit" element={<ExerciseEditorScreen />} />
              <Route path="/exercise/:id/notes" element={<ExerciseNotesScreen />} />
              <Route path="/exercise/:id/records" element={<RecordsScreen />} />
              <Route path="/exercise/:id/overview" element={<ExerciseOverviewScreen />} />
              <Route path="/train/:date/:exerciseId" element={<TrainingScreen />} />
              <Route path="/calendar" element={<CalendarScreen />} />
              <Route path="/routines" element={<RoutinesScreen />} />
              <Route path="/routine/new" element={<RoutineEditorScreen />} />
              <Route path="/routine/:id" element={<RoutineScreen />} />
              <Route path="/routine/:id/edit" element={<RoutineEditorScreen />} />
              <Route path="/body" element={<BodyTrackerScreen />} />
              <Route path="/body/measurements" element={<MeasurementsScreen />} />
              <Route path="/body/measurement/new" element={<MeasurementEditorScreen />} />
              <Route path="/body/measurement/:id" element={<MeasurementEditorScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/settings/database" element={<DatabaseScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </ToastProvider>
      </SqlProvider>
    </DbProvider>
  );
}

/** Applies the Theme setting to <html data-theme> and the browser chrome colour. */
function ThemeApplier() {
  const theme = useQuery((db) => getSettings(db).appTheme);
  useEffect(() => {
    const dark = theme === AppTheme.DARK;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1a1a' : '#1f1f1f');
  }, [theme]);
  return null;
}
