import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@/app/db-context';
import { useRouteDate } from '@/app/hooks';
import { getExercise } from '@/db/repo/exercises';
import { TopBar } from '@/ui/components/TopBar';
import { Tabs } from '@/ui/components/Tabs';
import { HistoryTab } from './HistoryTab';
import { GraphTab } from './GraphTab';
import { GoalsTab, RecordsTab, StatsTab } from './Records';

type Tab = 'history' | 'graph' | 'records' | 'stats' | 'goals';

/** Exercise Overview: History, Graph, Records, Stats and Goals for an exercise (read-only entry point). */
export function ExerciseOverviewScreen() {
  const id = Number(useParams().id);
  const date = useRouteDate();
  const exercise = useQuery((d) => getExercise(d, id), [id]);
  const [search, setSearch] = useSearchParams();
  const tab = (search.get('tab') as Tab) || 'history';
  if (!exercise) return <div className="empty">Exercise not found.</div>;
  return (
    <div className="screen">
      <TopBar back title={exercise.name} subtitle={exercise.categoryName} />
      <Tabs
        tabs={[{ id: 'history', label: 'History' }, { id: 'graph', label: 'Graph' }, { id: 'records', label: 'Records' }, { id: 'stats', label: 'Stats' }, { id: 'goals', label: 'Goals' }]}
        value={tab}
        onChange={(t) => setSearch((p) => { p.set('tab', t); return p; }, { replace: true })}
      />
      {tab === 'history' && <HistoryTab exercise={exercise} date={date} />}
      {tab === 'graph' && <GraphTab exercise={exercise} />}
      {tab === 'records' && <RecordsTab exercise={exercise} />}
      {tab === 'stats' && <StatsTab exercise={exercise} date={date} />}
      {tab === 'goals' && <GoalsTab exercise={exercise} />}
    </div>
  );
}
