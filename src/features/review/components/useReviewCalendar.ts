import { useEffect, useMemo, useState } from 'react';

import { reviewCalendarDayKey, reviewCalendarMonths } from '../../../../lib/core/review/reviewCalendarDates';
import { resolveCurrentDayStart, resolveNextDayStart } from '../../../../lib/core/review/reviewDayBoundary';
import type { NativeReviewCalendar } from '../../../../lib/platform/nativeReviewCalendarContract';
import { loadReviewCalendarHistoryFromRuntime } from '../../../shared/platform/runtime/reviewCalendarRuntimeRepository';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { getCurrentReviewSchedulerSettings } from '../../settings/model/reviewSchedulerSettings';

export function useReviewCalendar() {
  const libraryScope = useWorkspaceStore((s) => s.libraryScope);
  const [now, setNow] = useState(() => new Date());
  const [snapshot, setSnapshot] = useState<{ scope: string; value: NativeReviewCalendar } | null>(null);
  const history = snapshot && snapshot.scope === libraryScope ? snapshot.value : null;
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const hour = getCurrentReviewSchedulerSettings().newDayStartsAtHour;
  const today = reviewCalendarDayKey(now, hour);
  const months = useMemo(() => reviewCalendarMonths(resolveCurrentDayStart(now, hour)), [today, hour]);
  const from = new Date(months[0]!.getFullYear(), months[0]!.getMonth(), 1, hour).toISOString();
  const last = months[11]!;
  const to = new Date(last.getFullYear(), last.getMonth() + 1, 1, hour).toISOString();

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null); setFailed(false);
    if (!libraryScope) { setFailed(true); return; }
    void loadReviewCalendarHistoryFromRuntime({ from, to, now: now.toISOString(), libraryScope }).then((result) => {
      if (!cancelled) setSnapshot({ scope: libraryScope, value: result });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [from, to, libraryScope, retry, now]);

  useEffect(() => {
    const update = () => { setNow(new Date()); setRetry((v) => v + 1); };
    const boundary = resolveNextDayStart(new Date(), hour);
    const timer = window.setTimeout(update, Math.max(1, boundary.getTime() - Date.now()));
    return () => { window.clearTimeout(timer); };
  }, [today, hour]);

  const schedule = useMemo(() => new Map(history?.scheduledDays.map(day => [day.day, day])), [history]);
  const recorded = useMemo(() => new Map(history?.days.map((day) => [day.day, day])), [history]);
  function counts(day: string) {
    if (!history) return { day, items: null, topics: null };
    if (day >= today) return schedule.get(day) ?? { day, items: 0, topics: 0 };
    return recorded.get(day) ?? { day, items: 0, topics: day < history.topicCoverageFrom ? null : 0 };
  }
  return { today, months, counts, failed, retry: () => setRetry((v) => v + 1) };
}
