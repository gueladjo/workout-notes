import { useCallback, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isValidIsoDate, todayIso } from '@/domain/dates';
import { useQuery } from './db-context';
import { getSettings } from '@/db/repo/settings';

/** Workout date from the route (`/workout/:date` or `?date=`), defaulting to today. */
export function useRouteDate(): string {
  const params = useParams();
  const [search] = useSearchParams();
  const candidate = params.date ?? search.get('date') ?? '';
  return isValidIsoDate(candidate) ? candidate : todayIso();
}

export function useSettings() {
  return useQuery((db) => getSettings(db));
}

export function useNumberParam(name: string): number | undefined {
  const params = useParams();
  const n = Number(params[name]);
  return Number.isFinite(n) ? n : undefined;
}

/** Boolean state plus stable toggles, for dialogs and menus. */
export function useFlag(initial = false): [boolean, () => void, () => void] {
  const [on, setOn] = useState(initial);
  const open = useCallback(() => setOn(true), []);
  const close = useCallback(() => setOn(false), []);
  return [on, open, close];
}

/** Go back, or to a fallback route when there is no history (deep link / PWA start). */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if ((location.key && location.key !== 'default') || window.history.length > 1) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, location.key, fallback]);
}
